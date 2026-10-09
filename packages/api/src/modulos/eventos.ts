import { and, desc, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm';
import { cliente, db, envioPush, evento, panel, senal, sitio, usuario, usuarioPanel, zona } from '@monitoring/db';
import { tipoSenal } from '@monitoring/shared';
import { unirUsuarioPanel, unirZona } from './_evento.js';
import type { App } from '../tipos.js';

export function registrarEventos(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/eventos', async (request) => {
    // codigos=BRIDGE,BRIDGE-R: el historial de caídas del puente, que no es de ningún panel
    const { panelId, limite, codigos } = request.query as { panelId?: string; limite?: string; codigos?: string };
    const max = Math.min(Number(limite ?? 100), 1000);
    const base = db
      .select({
        ...getTableColumns(evento),
        zonaDescripcion: zona.descripcion,
        usuarioPanelNombre: usuarioPanel.nombre,
        clienteNombre: cliente.nombre,
        prefijo: panel.prefijo,
      })
      .from(evento)
      .leftJoin(zona, unirZona(evento.panelId))
      .leftJoin(usuarioPanel, unirUsuarioPanel(evento.panelId))
      .leftJoin(panel, eq(evento.panelId, panel.id))
      .leftJoin(sitio, eq(panel.sitioId, sitio.id))
      .leftJoin(cliente, eq(sitio.clienteId, cliente.id));
    const condiciones: SQL[] = [];
    if (panelId) condiciones.push(eq(evento.panelId, Number(panelId)));
    const listaCodigos = (codigos ?? '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 20);
    if (listaCodigos.length) condiciones.push(inArray(evento.codigo, listaCodigos));
    const filtrada = condiciones.length ? base.where(and(...condiciones)) : base;
    const filas = await filtrada.orderBy(desc(evento.ocurridoEn)).limit(max);
    return filas.map((f) => ({ ...f, tipo: tipoSenal(f) }));
  });

  /** Rastro de avisos push de varios eventos: a quién se le avisó, si llegó, si habló. */
  app.get('/avisos-push', async (request) => {
    const { eventoIds } = request.query as { eventoIds?: string };
    const ids = (eventoIds ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
    if (ids.length === 0) return [];
    return db
      .select({
        id: envioPush.id,
        eventoId: envioPush.eventoId,
        usuarioId: envioPush.usuarioId,
        usuarioNombre: usuario.nombre,
        resultado: envioPush.resultado,
        detalle: envioPush.detalle,
        enviadoEn: envioPush.enviadoEn,
        recibidoEn: envioPush.recibidoEn,
        voz: envioPush.voz,
      })
      .from(envioPush)
      .innerJoin(usuario, eq(envioPush.usuarioId, usuario.id))
      .where(inArray(envioPush.eventoId, ids))
      .orderBy(envioPush.eventoId, envioPush.id);
  });

  /** Diario crudo: TODO lo recibido, incluidos latidos, errores y tramas ignoradas. */
  app.get('/senales', async (request) => {
    const { limite } = request.query as { limite?: string };
    const max = Math.min(Number(limite ?? 200), 1000);
    return db
      .select({ ...getTableColumns(senal), numeroCuenta: panel.numeroCuenta, prefijo: panel.prefijo, clienteNombre: cliente.nombre })
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
