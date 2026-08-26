import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { alarma, cliente, db, evento, panel, sitio, zona } from '@monitoring/db';
import { abrirAlarma } from '@monitoring/engine';
import type { App } from '../tipos.js';

/**
 * API de la app de clientes. TODO acceso queda acotado al clienteId del JWT:
 * un usuario de app jamás ve sitios, paneles o eventos de otro cliente.
 */
export function registrarClienteApp(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', async (request, reply) => {
    if (request.user.rol !== 'cliente' || !request.user.clienteId) {
      return reply.code(403).send({ error: 'Solo usuarios de la app de clientes' });
    }
  });

  /** Los paneles del cliente autenticado (guardia de aislamiento reutilizada). */
  async function panelesDelCliente(clienteId: number) {
    return db
      .select({
        id: panel.id,
        numeroCuenta: panel.numeroCuenta,
        tipo: panel.tipo,
        activo: panel.activo,
        ultimaSenalEn: panel.ultimaSenalEn,
        sitioId: sitio.id,
        sitioNombre: sitio.nombre,
        sitioDireccion: sitio.direccion,
      })
      .from(panel)
      .innerJoin(sitio, eq(panel.sitioId, sitio.id))
      .where(eq(sitio.clienteId, clienteId));
  }

  app.get('/cliente/resumen', async (request) => {
    const clienteId = request.user.clienteId!;
    const [filaCliente] = await db
      .select({ id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono })
      .from(cliente)
      .where(eq(cliente.id, clienteId))
      .limit(1);
    const paneles = await panelesDelCliente(clienteId);

    const conEstado = await Promise.all(
      paneles.map(async (p) => {
        const [ultimoMovimiento] = await db
          .select({ categoria: evento.categoria, ocurridoEn: evento.ocurridoEn })
          .from(evento)
          .where(and(eq(evento.panelId, p.id), inArray(evento.categoria, ['apertura', 'cierre'])))
          .orderBy(desc(evento.ocurridoEn))
          .limit(1);
        return {
          ...p,
          estadoArmado:
            ultimoMovimiento?.categoria === 'cierre'
              ? 'armado'
              : ultimoMovimiento?.categoria === 'apertura'
                ? 'desarmado'
                : 'desconocido',
          ultimoMovimientoEn: ultimoMovimiento?.ocurridoEn ?? null,
        };
      }),
    );

    return { cliente: filaCliente, paneles: conEstado };
  });

  app.get('/cliente/eventos', async (request) => {
    const clienteId = request.user.clienteId!;
    const { limite } = request.query as { limite?: string };
    const max = Math.min(Number(limite ?? 50), 200);
    const paneles = await panelesDelCliente(clienteId);
    if (paneles.length === 0) return [];
    return db
      .select({
        id: evento.id,
        panelId: evento.panelId,
        categoria: evento.categoria,
        codigo: evento.codigo,
        descripcion: evento.descripcion,
        zona: evento.zona,
        ocurridoEn: evento.ocurridoEn,
        zonaDescripcion: zona.descripcion,
      })
      .from(evento)
      .leftJoin(zona, and(eq(zona.panelId, evento.panelId), eq(zona.numero, evento.zona)))
      .where(
        and(
          inArray(
            evento.panelId,
            paneles.map((p) => p.id),
          ),
          // Las pruebas periódicas son ruido para el cliente final
          ne(evento.categoria, 'prueba'),
        ),
      )
      .orderBy(desc(evento.ocurridoEn))
      .limit(max);
  });

  /** Alarmas abiertas sobre sus paneles: "la central está atendiendo su alarma". */
  app.get('/cliente/alarmas', async (request) => {
    const clienteId = request.user.clienteId!;
    const paneles = await panelesDelCliente(clienteId);
    if (paneles.length === 0) return [];
    return db
      .select({
        id: alarma.id,
        estado: alarma.estado,
        prioridad: alarma.prioridad,
        creadoEn: alarma.creadoEn,
        descripcion: evento.descripcion,
        codigo: evento.codigo,
        panelId: alarma.panelId,
      })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .where(
        and(
          inArray(
            alarma.panelId,
            paneles.map((p) => p.id),
          ),
          ne(alarma.estado, 'cerrada'),
        ),
      )
      .orderBy(alarma.prioridad, desc(alarma.creadoEn));
  });

  const esquemaPanico = z.object({ sitioId: z.number().int() });

  /** Botón de pánico: entra a la cola del operador como prioridad máxima. */
  app.post('/cliente/panico', async (request, reply) => {
    const clienteId = request.user.clienteId!;
    const datos = esquemaPanico.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'sitioId requerido' });

    // El sitio tiene que ser del cliente autenticado
    const [filaSitio] = await db
      .select({ id: sitio.id, nombre: sitio.nombre, direccion: sitio.direccion })
      .from(sitio)
      .where(and(eq(sitio.id, datos.data.sitioId), eq(sitio.clienteId, clienteId)))
      .limit(1);
    if (!filaSitio) return reply.code(404).send({ error: 'Sitio no encontrado' });

    const [panelSitio] = await db.select({ id: panel.id, numeroCuenta: panel.numeroCuenta }).from(panel).where(eq(panel.sitioId, filaSitio.id)).limit(1);

    const descripcion = `BOTÓN DE PÁNICO (app): ${request.user.email} — ${filaSitio.nombre}${
      filaSitio.direccion ? `, ${filaSitio.direccion}` : ''
    }`;
    const [filaEvento] = await db
      .insert(evento)
      .values({
        panelId: panelSitio?.id,
        numeroCuenta: panelSitio?.numeroCuenta,
        categoria: 'alarma',
        codigo: 'PANICO',
        descripcion,
        prioridad: 1,
        ocurridoEn: new Date(),
      })
      .returning({ id: evento.id });

    const alarmaId = await abrirAlarma({
      eventoId: filaEvento!.id,
      panelId: panelSitio?.id,
      prioridad: 1,
      descripcion,
      numeroCuenta: panelSitio?.numeroCuenta,
    });

    return reply.code(201).send({ alarmaId, recibido: true });
  });
}
