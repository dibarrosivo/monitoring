import { desc, eq } from 'drizzle-orm';
import { db, evento, senal } from '@monitoring/db';
import type { App } from '../tipos.js';

export function registrarEventos(app: App) {
  app.addHook('onRequest', app.autenticar);

  app.get('/eventos', async (request) => {
    const { panelId, limite } = request.query as { panelId?: string; limite?: string };
    const max = Math.min(Number(limite ?? 100), 1000);
    const base = panelId
      ? db.select().from(evento).where(eq(evento.panelId, Number(panelId)))
      : db.select().from(evento);
    return base.orderBy(desc(evento.ocurridoEn)).limit(max);
  });

  /** Diario crudo de señales, para diagnóstico y auditoría. */
  app.get('/senales', async (request) => {
    const { limite } = request.query as { limite?: string };
    const max = Math.min(Number(limite ?? 100), 1000);
    return db.select().from(senal).orderBy(desc(senal.recibidaEn)).limit(max);
  });
}
