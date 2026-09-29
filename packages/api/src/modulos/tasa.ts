import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, tasaCambio } from '@monitoring/db';
import type { App } from '../tipos.js';
import { actualizarTasa, guardarTasa, tasaVigente } from '../tasa/bcv.js';

/**
 * Tasa de cambio: la consultan la consola y la app (cualquier usuario con
 * sesión) para convertir los montos en dólares a bolívares al momento. Solo
 * un administrador la carga a mano o fuerza una lectura del BCV.
 */
export function registrarTasa(app: App) {
  app.addHook('onRequest', app.autenticar);

  app.get('/tasa', async () => {
    const vigente = await tasaVigente();
    const ultimas = await db.select().from(tasaCambio).where(eq(tasaCambio.moneda, 'USD')).orderBy(desc(tasaCambio.fechaValor)).limit(10);
    return { vigente, ultimas: ultimas.map((t) => ({ valor: Number(t.valor), fechaValor: t.fechaValor, fuente: t.fuente, obtenidoEn: t.obtenidoEn })) };
  });

  const esquemaManual = z.object({
    valor: z.number().positive().max(1_000_000),
    fechaValor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });

  app.post('/tasa', async (request, reply) => {
    if (request.user.rol !== 'admin') return reply.code(403).send({ error: 'Solo administradores' });
    const datos = esquemaManual.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Se necesita valor (Bs por USD) y fechaValor (AAAA-MM-DD)' });
    await guardarTasa(datos.data, 'manual');
    request.log.info({ ...datos.data, usuario: request.user.email }, 'Tasa cargada a mano');
    return { vigente: await tasaVigente() };
  });

  app.post('/tasa/actualizar', async (request, reply) => {
    if (request.user.rol !== 'admin') return reply.code(403).send({ error: 'Solo administradores' });
    const resultado = await actualizarTasa(request.log);
    return { resultado, vigente: await tasaVigente() };
  });
}
