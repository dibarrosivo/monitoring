import { and, count, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { alarma, cliente, db, evento, panel, senal, sitio } from '@monitoring/db';
import type { App } from '../tipos.js';

/** Resumen operativo para el tablero del administrador: una sola consulta HTTP. */
export function registrarTablero(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/tablero', async () => {
    const ahora = new Date();
    const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

    const [
      alarmasPorEstado,
      [panelesActivos],
      [panelesSilenciosos],
      [clientesActivos],
      [senalesHoy],
      [eventosHoy],
      [cerradasHoy],
      eventosHoyPorCategoria,
      ultimasAlarmas,
    ] = await Promise.all([
      db.select({ estado: alarma.estado, cantidad: count() }).from(alarma).where(ne(alarma.estado, 'cerrada')).groupBy(alarma.estado),
      db.select({ cantidad: count() }).from(panel).where(eq(panel.activo, true)),
      db
        .select({ cantidad: count() })
        .from(panel)
        .where(
          and(
            eq(panel.activo, true),
            eq(panel.supervisado, true),
            sql`COALESCE(${panel.ultimaSenalEn}, ${panel.creadoEn}) < now() - (${panel.intervaloPruebaMin} * interval '90 seconds')`,
          ),
        ),
      db.select({ cantidad: count() }).from(cliente).where(eq(cliente.activo, true)),
      db.select({ cantidad: count() }).from(senal).where(gte(senal.recibidaEn, inicioDia)),
      db.select({ cantidad: count() }).from(evento).where(gte(evento.ocurridoEn, inicioDia)),
      db.select({ cantidad: count() }).from(alarma).where(and(eq(alarma.estado, 'cerrada'), gte(alarma.cerradaEn, inicioDia))),
      db
        .select({ categoria: evento.categoria, cantidad: count() })
        .from(evento)
        .where(gte(evento.ocurridoEn, inicioDia))
        .groupBy(evento.categoria)
        .orderBy(desc(count())),
      db
        .select({
          id: alarma.id,
          estado: alarma.estado,
          prioridad: alarma.prioridad,
          creadoEn: alarma.creadoEn,
          codigo: evento.codigo,
          descripcion: evento.descripcion,
          numeroCuenta: evento.numeroCuenta,
          clienteNombre: cliente.nombre,
        })
        .from(alarma)
        .innerJoin(evento, eq(alarma.eventoId, evento.id))
        .leftJoin(panel, eq(alarma.panelId, panel.id))
        .leftJoin(sitio, eq(panel.sitioId, sitio.id))
        .leftJoin(cliente, eq(sitio.clienteId, cliente.id))
        .orderBy(desc(alarma.creadoEn))
        .limit(8),
    ]);

    return {
      alarmas: {
        nuevas: alarmasPorEstado.find((a) => a.estado === 'nueva')?.cantidad ?? 0,
        enAtencion: alarmasPorEstado.find((a) => a.estado === 'en_atencion')?.cantidad ?? 0,
        cerradasHoy: cerradasHoy?.cantidad ?? 0,
      },
      paneles: { activos: panelesActivos?.cantidad ?? 0, silenciosos: panelesSilenciosos?.cantidad ?? 0 },
      clientes: { activos: clientesActivos?.cantidad ?? 0 },
      hoy: { senales: senalesHoy?.cantidad ?? 0, eventos: eventosHoy?.cantidad ?? 0 },
      eventosHoyPorCategoria,
      ultimasAlarmas,
    };
  });
}
