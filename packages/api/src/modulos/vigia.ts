import { timingSafeEqual } from 'node:crypto';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, dispositivoPush, usuario } from '@monitoring/db';
import type { App } from '../tipos.js';

/**
 * Para el vigía externo (tools/vigia): los teléfonos del personal a los que
 * avisar si la central se cae. El vigía que corre en el servidor de
 * TrueTracker los pide cada hora mientras la central anda y los guarda, porque
 * cuando hace falta avisar la central justamente no contesta. El 18-10-2026
 * Contabo apagó los dos servidores y nadie se enteró hasta que el dueño quiso
 * entrar a la web.
 *
 * Sin sesión: lo protege una clave compartida (VIGIA_CLAVE, 32 caracteres o
 * más). Sin clave configurada la ruta no existe.
 */
export function registrarVigia(app: App) {
  const clave = (process.env.VIGIA_CLAVE ?? '').trim();
  if (clave.length < 32) return;
  const esperada = Buffer.from(clave);

  app.get('/vigia/destinos', async (request, reply) => {
    const recibida = Buffer.from(String(request.headers['x-vigia-clave'] ?? ''));
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      return reply.code(404).send({ error: 'No encontrado' });
    }
    const filas = await db
      .select({ token: dispositivoPush.token, rol: usuario.rol, nombre: usuario.nombre })
      .from(dispositivoPush)
      .innerJoin(usuario, eq(dispositivoPush.usuarioId, usuario.id))
      .where(and(eq(usuario.activo, true), inArray(usuario.rol, ['admin', 'supervisor', 'operador']), isNotNull(dispositivoPush.token)));
    return { destinos: filas };
  });
}
