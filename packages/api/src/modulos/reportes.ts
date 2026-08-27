import { and, asc, between, count, desc, eq, inArray } from 'drizzle-orm';
import { alarma, cliente, db, evento, panel, sitio } from '@monitoring/db';
import type { App } from '../tipos.js';

/**
 * Reporte de actividad por cliente y período: totales por categoría, alarmas
 * con métricas de respuesta y el detalle de eventos para exportar. Es el
 * documento que respalda el servicio ante el cliente.
 */
export function registrarReportes(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/reportes', async (request, reply) => {
    const { clienteId, desde, hasta } = request.query as { clienteId?: string; desde?: string; hasta?: string };
    if (!clienteId || !desde || !hasta) {
      return reply.code(400).send({ error: 'clienteId, desde y hasta son obligatorios' });
    }
    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);
    if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
      return reply.code(400).send({ error: 'Fechas inválidas' });
    }

    const [filaCliente] = await db
      .select({ id: cliente.id, nombre: cliente.nombre })
      .from(cliente)
      .where(eq(cliente.id, Number(clienteId)))
      .limit(1);
    if (!filaCliente) return reply.code(404).send({ error: 'Cliente no encontrado' });

    const paneles = await db
      .select({ id: panel.id, numeroCuenta: panel.numeroCuenta, sitioNombre: sitio.nombre })
      .from(panel)
      .innerJoin(sitio, eq(panel.sitioId, sitio.id))
      .where(eq(sitio.clienteId, filaCliente.id));

    const vacio = {
      cliente: filaCliente,
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      paneles,
      totalesPorCategoria: [],
      alarmas: [],
      eventos: [],
      estadisticas: { totalEventos: 0, totalAlarmas: 0, respuestaMediaSeg: null, cierreMedioSeg: null },
    };
    if (paneles.length === 0) return vacio;
    const idsPaneles = paneles.map((p) => p.id);

    const condicionEventos = and(
      inArray(evento.panelId, idsPaneles),
      between(evento.ocurridoEn, fechaDesde, fechaHasta),
    );

    const totalesPorCategoria = await db
      .select({ categoria: evento.categoria, cantidad: count() })
      .from(evento)
      .where(condicionEventos)
      .groupBy(evento.categoria)
      .orderBy(desc(count()));

    const eventos = await db
      .select({
        id: evento.id,
        codigo: evento.codigo,
        categoria: evento.categoria,
        descripcion: evento.descripcion,
        numeroCuenta: evento.numeroCuenta,
        zona: evento.zona,
        particion: evento.particion,
        ocurridoEn: evento.ocurridoEn,
      })
      .from(evento)
      .where(condicionEventos)
      .orderBy(asc(evento.ocurridoEn))
      .limit(5000);

    const alarmas = await db
      .select({
        id: alarma.id,
        estado: alarma.estado,
        prioridad: alarma.prioridad,
        creadoEn: alarma.creadoEn,
        tomadaEn: alarma.tomadaEn,
        cerradaEn: alarma.cerradaEn,
        resolucion: alarma.resolucion,
        codigo: evento.codigo,
        descripcion: evento.descripcion,
        numeroCuenta: evento.numeroCuenta,
      })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .where(and(inArray(alarma.panelId, idsPaneles), between(alarma.creadoEn, fechaDesde, fechaHasta)))
      .orderBy(asc(alarma.creadoEn));

    const respuestas = alarmas
      .filter((a) => a.tomadaEn)
      .map((a) => (new Date(a.tomadaEn!).getTime() - new Date(a.creadoEn).getTime()) / 1000);
    const cierres = alarmas
      .filter((a) => a.cerradaEn)
      .map((a) => (new Date(a.cerradaEn!).getTime() - new Date(a.creadoEn).getTime()) / 1000);
    const media = (valores: number[]) =>
      valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : null;

    return {
      ...vacio,
      totalesPorCategoria,
      alarmas,
      eventos,
      estadisticas: {
        totalEventos: eventos.length,
        totalAlarmas: alarmas.length,
        respuestaMediaSeg: media(respuestas),
        cierreMedioSeg: media(cierres),
      },
    };
  });
}
