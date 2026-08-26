import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import { db, evento, senal, zona } from '@monitoring/db';
import type { App } from '../tipos.js';

export function registrarEventos(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/eventos', async (request) => {
    const { panelId, limite } = request.query as { panelId?: string; limite?: string };
    const max = Math.min(Number(limite ?? 100), 1000);
    const base = db
      .select({ ...getTableColumns(evento), zonaDescripcion: zona.descripcion })
      .from(evento)
      .leftJoin(zona, and(eq(zona.panelId, evento.panelId), eq(zona.numero, evento.zona)));
    const filtrada = panelId ? base.where(eq(evento.panelId, Number(panelId))) : base;
    return filtrada.orderBy(desc(evento.ocurridoEn)).limit(max);
  });

  /** Diario crudo de señales, para diagnóstico y auditoría. */
  app.get('/senales', async (request) => {
    const { limite } = request.query as { limite?: string };
    const max = Math.min(Number(limite ?? 100), 1000);
    return db.select().from(senal).orderBy(desc(senal.recibidaEn)).limit(max);
  });

  /** Una señal cruda puntual: el "Ver" de un evento en la consola. */
  app.get('/senales/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db.select().from(senal).where(eq(senal.id, id)).limit(1);
    if (!fila) return reply.code(404).send({ error: 'Señal no encontrada' });
    return fila;
  });
}
