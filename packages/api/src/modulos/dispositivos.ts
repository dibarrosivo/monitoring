import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, dispositivoPush } from '@monitoring/db';
import type { App } from '../tipos.js';

/**
 * Registro del teléfono para avisos push, para CUALQUIER usuario con sesión.
 *
 * La app de clientes tiene su propia ruta bajo /cliente (la publicada ya la
 * usa), pero el personal de la central también necesita registrar su teléfono
 * y aquel módulo rechaza todo lo que no sea rol cliente. Ambas escriben en la
 * misma tabla.
 */
export function registrarDispositivosPush(app: App) {
  app.addHook('onRequest', app.autenticar);

  const esquema = z.object({ token: z.string().min(20).max(4096), plataforma: z.enum(['android', 'ios', 'web']).default('android') });

  app.post('/dispositivos-push', async (request, reply) => {
    const datos = esquema.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    await db
      .insert(dispositivoPush)
      .values({ usuarioId: request.user.id, token: datos.data.token, plataforma: datos.data.plataforma })
      .onConflictDoUpdate({ target: dispositivoPush.token, set: { usuarioId: request.user.id, ultimoUsoEn: new Date() } });
    return reply.code(201).send({ registrado: true });
  });

  app.delete('/dispositivos-push', async (request, reply) => {
    const datos = z.object({ token: z.string().min(1) }).safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'token requerido' });
    await db.delete(dispositivoPush).where(and(eq(dispositivoPush.token, datos.data.token), eq(dispositivoPush.usuarioId, request.user.id)));
    return { eliminado: true };
  });

  /** Rastro de dónde se traba el registro en un teléfono que no recibe nada. */
  app.post('/dispositivos-push/diagnostico', async (request) => {
    const datos = z.object({ etapa: z.string().max(40), detalle: z.string().max(400).nullable() }).safeParse(request.body);
    if (datos.success) request.log.warn({ push: datos.data, usuario: request.user.email }, 'Diagnóstico de push del teléfono');
    return { ok: true };
  });
}
