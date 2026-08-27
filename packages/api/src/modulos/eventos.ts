import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import { cliente, db, evento, panel, senal, sitio, zona } from '@monitoring/db';
import type { App } from '../tipos.js';

export function registrarEventos(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/eventos', async (request) => {
    const { panelId, limite } = request.query as { panelId?: string; limite?: string };
    const max = Math.min(Number(limite ?? 100), 1000);
    const base = db
      .select({ ...getTableColumns(evento), zonaDescripcion: zona.descripcion, clienteNombre: cliente.nombre })
      .from(evento)
      .leftJoin(zona, and(eq(zona.panelId, evento.panelId), eq(zona.numero, evento.zona)))
      .leftJoin(panel, eq(evento.panelId, panel.id))
      .leftJoin(sitio, eq(panel.sitioId, sitio.id))
      .leftJoin(cliente, eq(sitio.clienteId, cliente.id));
    const filtrada = panelId ? base.where(eq(evento.panelId, Number(panelId))) : base;
    return filtrada.orderBy(desc(evento.ocurridoEn)).limit(max);
  });

  /** Diario crudo: TODO lo recibido, incluidos latidos, errores y tramas ignoradas. */
  app.get('/senales', async (request) => {
    const { limite } = request.query as { limite?: string };
    const max = Math.min(Number(limite ?? 200), 1000);
    return db
      .select({ ...getTableColumns(senal), numeroCuenta: panel.numeroCuenta, clienteNombre: cliente.nombre })
      .from(senal)
      .leftJoin(panel, eq(senal.panelId, panel.id))
      .leftJoin(sitio, eq(panel.sitioId, sitio.id))
      .leftJoin(cliente, eq(sitio.clienteId, cliente.id))
      .orderBy(desc(senal.recibidaEn))
      .limit(max);
  });

  /** Una señal cruda puntual: el "Ver" de un evento en la consola. */
  app.get('/senales/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db.select().from(senal).where(eq(senal.id, id)).limit(1);
    if (!fila) return reply.code(404).send({ error: 'Señal no encontrada' });
    return fila;
  });
}
