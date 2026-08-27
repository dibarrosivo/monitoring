import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { accionAlarma, alarma, cliente, contacto, db, evento, panel, sitio, zona } from '@monitoring/db';
import { abrirAlarma } from '@monitoring/engine';
import type { App } from '../tipos.js';

const esquemaNota = z.object({ detalle: z.string().min(1) });
const esquemaCierre = z.object({ resolucion: z.string().min(1) });

export function registrarAlarmas(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  /** Cola del operador: por defecto todas las alarmas no cerradas, primero las de mayor prioridad. */
  app.get('/alarmas', async (request) => {
    const { estado } = request.query as { estado?: 'nueva' | 'en_atencion' | 'cerrada' };
    const condicion = estado ? eq(alarma.estado, estado) : ne(alarma.estado, 'cerrada');
    return db
      .select({
        id: alarma.id,
        estado: alarma.estado,
        prioridad: alarma.prioridad,
        operadorId: alarma.operadorId,
        creadoEn: alarma.creadoEn,
        tomadaEn: alarma.tomadaEn,
        cerradaEn: alarma.cerradaEn,
        resolucion: alarma.resolucion,
        evento: {
          id: evento.id,
          senalId: evento.senalId,
          codigo: evento.codigo,
          categoria: evento.categoria,
          descripcion: evento.descripcion,
          numeroCuenta: evento.numeroCuenta,
          particion: evento.particion,
          zona: evento.zona,
          ocurridoEn: evento.ocurridoEn,
        },
        zonaDescripcion: zona.descripcion,
        clienteNombre: cliente.nombre,
        panelId: alarma.panelId,
      })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .leftJoin(zona, and(eq(zona.panelId, alarma.panelId), eq(zona.numero, evento.zona)))
      .leftJoin(panel, eq(alarma.panelId, panel.id))
      .leftJoin(sitio, eq(panel.sitioId, sitio.id))
      .leftJoin(cliente, eq(sitio.clienteId, cliente.id))
      .where(condicion)
      .orderBy(alarma.prioridad, desc(alarma.creadoEn))
      .limit(500);
  });

  /** Contexto para el panel de detalle: cliente, sitio, lista de llamadas y zona. */
  app.get('/alarmas/:id/contexto', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db
      .select({ panelId: alarma.panelId, zona: evento.zona, particion: evento.particion })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .where(eq(alarma.id, id))
      .limit(1);
    if (!fila) return reply.code(404).send({ error: 'Alarma no encontrada' });
    if (!fila.panelId) return { cliente: null, sitio: null, panel: null, contactos: [], zonaDescripcion: null };

    const [contexto] = await db
      .select({
        panel: { id: panel.id, numeroCuenta: panel.numeroCuenta, tipo: panel.tipo, modelo: panel.modelo },
        sitio: { id: sitio.id, nombre: sitio.nombre, direccion: sitio.direccion },
        cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono, instrucciones: cliente.instrucciones },
      })
      .from(panel)
      .innerJoin(sitio, eq(panel.sitioId, sitio.id))
      .innerJoin(cliente, eq(sitio.clienteId, cliente.id))
      .where(eq(panel.id, fila.panelId))
      .limit(1);
    if (!contexto) return { cliente: null, sitio: null, panel: null, contactos: [], zonaDescripcion: null };

    const contactos = await db
      .select()
      .from(contacto)
      .where(eq(contacto.clienteId, contexto.cliente.id))
      .orderBy(asc(contacto.orden));

    let zonaDescripcion: string | null = null;
    if (fila.zona) {
      const [filaZona] = await db
        .select({ descripcion: zona.descripcion })
        .from(zona)
        .where(
          and(eq(zona.panelId, fila.panelId), eq(zona.numero, fila.zona), eq(zona.particion, fila.particion ?? '01')),
        )
        .limit(1);
      zonaDescripcion = filaZona?.descripcion ?? null;
    }

    return { ...contexto, contactos, zonaDescripcion };
  });

  app.get('/alarmas/:id/acciones', async (request) => {
    const id = Number((request.params as { id: string }).id);
    return db.select().from(accionAlarma).where(eq(accionAlarma.alarmaId, id)).orderBy(accionAlarma.creadoEn);
  });

  app.post('/alarmas/:id/tomar', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db
      .update(alarma)
      .set({ estado: 'en_atencion', operadorId: request.user.id, tomadaEn: new Date() })
      .where(eq(alarma.id, id))
      .returning();
    if (!fila) return reply.code(404).send({ error: 'Alarma no encontrada' });
    await db.insert(accionAlarma).values({ alarmaId: id, operadorId: request.user.id, tipo: 'toma' });
    return fila;
  });

  app.post('/alarmas/:id/notas', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaNota.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db
      .insert(accionAlarma)
      .values({ alarmaId: id, operadorId: request.user.id, tipo: 'nota', detalle: datos.data.detalle })
      .returning();
    return reply.code(201).send(fila);
  });

  app.post('/alarmas/:id/cerrar', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaCierre.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db
      .update(alarma)
      .set({ estado: 'cerrada', cerradaEn: new Date(), resolucion: datos.data.resolucion })
      .where(eq(alarma.id, id))
      .returning();
    if (!fila) return reply.code(404).send({ error: 'Alarma no encontrada' });
    await db.insert(accionAlarma).values({ alarmaId: id, operadorId: request.user.id, tipo: 'cierre', detalle: datos.data.resolucion });
    return fila;
  });

  /**
   * Hombre muerto: la consola avisó que el operador no confirmó presencia.
   * Queda como alarma de sistema (prioridad 2) y en el registro de auditoría.
   */
  app.post('/vigilancia/hombre-muerto', async (request, reply) => {
    const descripcion = `HOMBRE MUERTO: ${request.user.email} no confirmó presencia en la consola`;
    const [filaEvento] = await db
      .insert(evento)
      .values({ categoria: 'sistema', codigo: 'HM', descripcion, prioridad: 2, ocurridoEn: new Date() })
      .returning({ id: evento.id });
    const alarmaId = await abrirAlarma({ eventoId: filaEvento!.id, prioridad: 2, descripcion });
    return reply.code(201).send({ alarmaId });
  });

  /** Estado operativo de los dispositivos: vida, armado y a quién pertenecen. */
  app.get('/paneles/estado', async () => {
    const paneles = await db
      .select({
        id: panel.id,
        sitioId: panel.sitioId,
        numeroCuenta: panel.numeroCuenta,
        tipo: panel.tipo,
        marca: panel.marca,
        modelo: panel.modelo,
        supervisado: panel.supervisado,
        intervaloPruebaMin: panel.intervaloPruebaMin,
        ultimaSenalEn: panel.ultimaSenalEn,
        activo: panel.activo,
        sitioNombre: sitio.nombre,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
      })
      .from(panel)
      .innerJoin(sitio, eq(panel.sitioId, sitio.id))
      .innerJoin(cliente, eq(sitio.clienteId, cliente.id))
      .orderBy(panel.numeroCuenta);

    // Último movimiento de apertura/cierre por panel, en una sola consulta
    const movimientos = await db
      .selectDistinctOn([evento.panelId], {
        panelId: evento.panelId,
        categoria: evento.categoria,
        ocurridoEn: evento.ocurridoEn,
      })
      .from(evento)
      .where(inArray(evento.categoria, ['apertura', 'cierre']))
      .orderBy(evento.panelId, desc(evento.ocurridoEn));
    const porPanel = new Map(movimientos.map((m) => [m.panelId, m]));

    return paneles.map((p) => {
      const movimiento = porPanel.get(p.id);
      return {
        ...p,
        estadoArmado:
          movimiento?.categoria === 'cierre' ? 'armado' : movimiento?.categoria === 'apertura' ? 'desarmado' : 'desconocido',
        ultimoMovimientoEn: movimiento?.ocurridoEn ?? null,
      };
    });
  });
}
