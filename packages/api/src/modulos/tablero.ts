import { and, asc, count, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { alarma, cliente, cuota, db, evento, panel, senal, sitio } from '@monitoring/db';
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
      [vencidos],
      [porVencer],
      cuentasVencidas,
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
          prefijo: panel.prefijo,
          clienteNombre: cliente.nombre,
        })
        .from(alarma)
        .innerJoin(evento, eq(alarma.eventoId, evento.id))
        .leftJoin(panel, eq(alarma.panelId, panel.id))
        .leftJoin(sitio, eq(panel.sitioId, sitio.id))
        .leftJoin(cliente, eq(sitio.clienteId, cliente.id))
        .orderBy(desc(alarma.creadoEn))
        .limit(8),
      // Cobros: solo aviso administrativo, no corta el monitoreo
      db.select({ cantidad: count() }).from(cuota).where(and(eq(cuota.estado, 'pendiente'), sql`${cuota.venceEn} < current_date`)),
      db
        .select({ cantidad: count() })
        .from(cuota)
        .where(and(eq(cuota.estado, 'pendiente'), sql`${cuota.venceEn} >= current_date`, sql`${cuota.venceEn} <= current_date + interval '7 days'`)),
      db
        .select({
          panelId: cuota.panelId,
          numeroCuenta: panel.numeroCuenta,
          prefijo: panel.prefijo,
          clienteId: cuota.clienteId,
          clienteNombre: cliente.nombre,
          concepto: cuota.concepto,
          venceEn: cuota.venceEn,
          montoUsd: sql<string>`${cuota.montoUsd} - ${cuota.pagadoUsd}`,
        })
        .from(cuota)
        .innerJoin(panel, eq(cuota.panelId, panel.id))
        .innerJoin(cliente, eq(cuota.clienteId, cliente.id))
        .where(and(eq(cuota.estado, 'pendiente'), sql`${cuota.venceEn} <= current_date + interval '7 days'`))
        .orderBy(asc(cuota.venceEn))
        .limit(10),
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
      facturacion: {
        vencidos: vencidos?.cantidad ?? 0,
        porVencer: porVencer?.cantidad ?? 0,
        cuentas: cuentasVencidas.map((c) => ({ ...c, montoUsd: Number(c.montoUsd) })),
      },
      eventosHoyPorCategoria,
      ultimasAlarmas,
    };
  });
}
