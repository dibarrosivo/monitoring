import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { ETIQUETA_DESENLACE, etiquetaMotivo, protocoloPara, RESULTADOS_LLAMADA } from '@monitoring/shared';
import { accionAlarma, alarma, cliente, contacto, db, evento, horario, panel, sitio, usuario, usuarioPanel, zona } from '@monitoring/db';
import { abrirAlarma } from '@monitoring/engine';
import type { App } from '../tipos.js';

const esquemaNota = z.object({ detalle: z.string().min(1) });
const esquemaCierre = z
  .object({
    /** Cómo terminó: separarlo del texto libre permite medir las falsas alarmas */
    desenlace: z.enum(['resuelta', 'falsa_alarma', 'escalada']).default('resuelta'),
    /** Por qué, con valores fijos (ver MOTIVOS_CIERRE). "otro" exige texto. */
    motivo: z.string().max(32).optional(),
    resolucion: z.string().max(2000).optional(),
  })
  .superRefine((d, ctx) => {
    const texto = d.resolucion?.trim() ?? '';
    if (d.motivo) {
      if (!etiquetaMotivo(d.desenlace, d.motivo)) {
        ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'Motivo desconocido para ese desenlace' });
      }
      if (d.motivo === 'otro' && !texto) {
        ctx.addIssue({ code: 'custom', path: ['resolucion'], message: 'Con motivo "otro" hay que detallar' });
      }
    } else if (!texto) {
      ctx.addIssue({ code: 'custom', path: ['resolucion'], message: 'Falta el motivo o la resolución' });
    }
  });

const esquemaPaso = z.object({ paso: z.string().min(1).max(200) });
const esquemaLlamada = z.object({
  contactoId: z.number().int().optional(),
  nombre: z.string().min(1).max(120),
  telefono: z.string().min(1).max(40),
  resultado: z.enum(Object.keys(RESULTADOS_LLAMADA) as [keyof typeof RESULTADOS_LLAMADA, ...(keyof typeof RESULTADOS_LLAMADA)[]]),
});
const esquemaDevolucion = z.object({ motivo: z.string().max(200).optional() });

/** "2 min 05 s", para que la bitácora diga cuánto tardó cada cosa. */
function duracionTexto(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

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
        restauradaEn: alarma.restauradaEn,
        desenlace: alarma.desenlace,
        motivo: alarma.motivo,
        resolucion: alarma.resolucion,
        /** Quién la tiene: con varios operadores, nadie debe trabajar la misma sin saberlo */
        operadorNombre: usuario.nombre,
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
        prefijo: panel.prefijo,
        panelId: alarma.panelId,
      })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .leftJoin(zona, and(eq(zona.panelId, alarma.panelId), eq(zona.numero, evento.zona)))
      .leftJoin(panel, eq(alarma.panelId, panel.id))
      .leftJoin(sitio, eq(panel.sitioId, sitio.id))
      .leftJoin(cliente, eq(sitio.clienteId, cliente.id))
      .leftJoin(usuario, eq(alarma.operadorId, usuario.id))
      .where(condicion)
      .orderBy(alarma.prioridad, desc(alarma.creadoEn))
      .limit(500);
  });

  /** Contexto para el panel de detalle: cliente, sitio, lista de llamadas y zona. */
  app.get('/alarmas/:id/contexto', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db
      .select({
        panelId: alarma.panelId,
        zona: evento.zona,
        particion: evento.particion,
        codigo: evento.codigo,
        categoria: evento.categoria,
      })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .where(eq(alarma.id, id))
      .limit(1);
    if (!fila) return reply.code(404).send({ error: 'Alarma no encontrada' });
    if (!fila.panelId) {
      // Cuenta desconocida: no hay ficha que mostrar, pero el protocolo igual aplica
      const pasos = protocoloPara({ codigo: fila.codigo, codigoCid: fila.codigo.replace(/^[ER]/, ''), categoria: fila.categoria });
      return { cliente: null, sitio: null, panel: null, contactos: [], zonaDescripcion: null, pasos, pasosCumplidos: [] };
    }

    const [contexto] = await db
      .select({
        panel: {
          id: panel.id,
          numeroCuenta: panel.numeroCuenta,
          prefijo: panel.prefijo,
          alias: panel.alias,
          tipo: panel.tipo,
          marca: panel.marca,
          modelo: panel.modelo,
          claveMaestra: panel.claveMaestra,
          instalador: panel.instalador,
          ultimaSenalEn: panel.ultimaSenalEn,
        },
        sitio: {
          id: sitio.id,
          nombre: sitio.nombre,
          tipo: sitio.tipo,
          direccion: sitio.direccion,
          ciudad: sitio.ciudad,
          referencia: sitio.referencia,
          latitud: sitio.latitud,
          longitud: sitio.longitud,
          telefono: sitio.telefono,
          llaves: sitio.llaves,
          instruccionesAcceso: sitio.instruccionesAcceso,
          // El plan de acción del sitio manda sobre el del cliente
          instrucciones: sitio.instrucciones,
        },
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          instrucciones: cliente.instrucciones,
          estado: cliente.estado,
          motivoEstado: cliente.motivoEstado,
        },
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

    /*
     * Protocolo del evento y pasos ya cumplidos. Los cumplidos se deducen de la
     * bitácora en vez de guardarse aparte: una sola fuente de verdad, imposible
     * que la casilla diga una cosa y el historial otra.
     */
    const pasos = protocoloPara({ codigo: fila.codigo, codigoCid: fila.codigo.replace(/^[ER]/, ''), categoria: fila.categoria });
    const cumplidos = pasos.length
      ? (
          await db
            .select({ detalle: accionAlarma.detalle })
            .from(accionAlarma)
            .where(and(eq(accionAlarma.alarmaId, id), eq(accionAlarma.tipo, 'paso')))
        )
          .map((a) => a.detalle)
          .filter((x): x is string => Boolean(x))
      : [];

    // Lo que el operador preguntaría a continuación: ¿el sitio debería estar
    // abierto ahora? ¿quién tiene código? ¿qué pasó las últimas veces?
    const [horarios, usuariosPanel, previas] = await Promise.all([
      db.select().from(horario).where(and(eq(horario.panelId, fila.panelId), eq(horario.activo, true))).orderBy(horario.apertura),
      db.select().from(usuarioPanel).where(eq(usuarioPanel.panelId, fila.panelId)).orderBy(usuarioPanel.numero),
      db
        .select({
          id: alarma.id,
          codigo: evento.codigo,
          descripcion: evento.descripcion,
          creadoEn: alarma.creadoEn,
          cerradaEn: alarma.cerradaEn,
          desenlace: alarma.desenlace,
          resolucion: alarma.resolucion,
          operadorNombre: usuario.nombre,
        })
        .from(alarma)
        .innerJoin(evento, eq(alarma.eventoId, evento.id))
        .leftJoin(usuario, eq(alarma.operadorId, usuario.id))
        .where(and(eq(alarma.panelId, fila.panelId), eq(alarma.estado, 'cerrada'), ne(alarma.id, id)))
        .orderBy(desc(alarma.creadoEn))
        .limit(5),
    ]);

    return { ...contexto, contactos, zonaDescripcion, pasos, pasosCumplidos: cumplidos, horarios, usuariosPanel, previas };
  });

  /** Bitácora con el nombre de quien hizo cada cosa; lo de sistema va sin autor. */
  app.get('/alarmas/:id/acciones', async (request) => {
    const id = Number((request.params as { id: string }).id);
    return db
      .select({
        id: accionAlarma.id,
        alarmaId: accionAlarma.alarmaId,
        operadorId: accionAlarma.operadorId,
        operadorNombre: usuario.nombre,
        tipo: accionAlarma.tipo,
        detalle: accionAlarma.detalle,
        creadoEn: accionAlarma.creadoEn,
      })
      .from(accionAlarma)
      .leftJoin(usuario, eq(accionAlarma.operadorId, usuario.id))
      .where(eq(accionAlarma.alarmaId, id))
      .orderBy(accionAlarma.creadoEn, accionAlarma.id);
  });

  /**
   * Tomar una alarma la asigna a quien la pide. Solo se toma una alarma NUEVA:
   * si otro operador ya la tiene, se responde 409 con su nombre, para que el
   * segundo no la trabaje a ciegas. Volver a tomar la propia es inocuo.
   */
  app.post('/alarmas/:id/tomar', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [actual] = await db
      .select({ id: alarma.id, estado: alarma.estado, operadorId: alarma.operadorId, creadoEn: alarma.creadoEn, operadorNombre: usuario.nombre })
      .from(alarma)
      .leftJoin(usuario, eq(alarma.operadorId, usuario.id))
      .where(eq(alarma.id, id))
      .limit(1);
    if (!actual) return reply.code(404).send({ error: 'Alarma no encontrada' });
    if (actual.estado === 'cerrada') return reply.code(409).send({ error: 'La alarma ya está cerrada' });
    if (actual.estado === 'en_atencion') {
      if (actual.operadorId === request.user.id) {
        const [misma] = await db.select().from(alarma).where(eq(alarma.id, id)).limit(1);
        return misma;
      }
      return reply.code(409).send({
        error: `La alarma ya la tiene ${actual.operadorNombre ?? 'otro operador'}`,
        operadorNombre: actual.operadorNombre,
      });
    }
    const ahora = new Date();
    const [fila] = await db
      .update(alarma)
      .set({ estado: 'en_atencion', operadorId: request.user.id, tomadaEn: ahora })
      .where(and(eq(alarma.id, id), eq(alarma.estado, 'nueva')))
      .returning();
    if (!fila) return reply.code(409).send({ error: 'Otro operador la tomó en este instante' });
    await db.insert(accionAlarma).values({
      alarmaId: id,
      operadorId: request.user.id,
      tipo: 'toma',
      detalle: `Tomada tras ${duracionTexto(ahora.getTime() - actual.creadoEn.getTime())} de espera`,
    });
    return fila;
  });

  /** Devolver a la cola: la alarma vuelve a NUEVA y otro puede tomarla. Queda en la bitácora. */
  app.post('/alarmas/:id/devolver', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaDevolucion.safeParse(request.body ?? {});
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db
      .update(alarma)
      .set({ estado: 'nueva', operadorId: null, tomadaEn: null })
      .where(and(eq(alarma.id, id), eq(alarma.estado, 'en_atencion')))
      .returning();
    if (!fila) return reply.code(409).send({ error: 'Solo se devuelve una alarma que está en atención' });
    await db.insert(accionAlarma).values({
      alarmaId: id,
      operadorId: request.user.id,
      tipo: 'sistema',
      detalle: `Devuelta a la cola${datos.data.motivo ? `: ${datos.data.motivo}` : ''}`,
    });
    return fila;
  });

  /**
   * Registro de una llamada a un contacto y su resultado. Es lo que hace
   * medible la verificación: quién atendió, quién no, y sobre todo la palabra
   * clave incorrecta, que es el indicio de coacción. Ese caso sube la alarma a
   * prioridad máxima y deja constancia, para que nadie la trate como rutina.
   */
  app.post('/alarmas/:id/llamada', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaLlamada.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [actual] = await db.select({ id: alarma.id, prioridad: alarma.prioridad }).from(alarma).where(eq(alarma.id, id)).limit(1);
    if (!actual) return reply.code(404).send({ error: 'Alarma no encontrada' });
    const { nombre, telefono, resultado } = datos.data;
    const [fila] = await db
      .insert(accionAlarma)
      .values({
        alarmaId: id,
        operadorId: request.user.id,
        tipo: 'llamada',
        detalle: `Llamada a ${nombre} (${telefono}): ${RESULTADOS_LLAMADA[resultado]}`,
      })
      .returning();
    if (resultado === 'clave_incorrecta') {
      await db.insert(accionAlarma).values({
        alarmaId: id,
        operadorId: null,
        tipo: 'sistema',
        detalle: `POSIBLE COACCIÓN: ${nombre} dio una palabra clave incorrecta. No avisar por teléfono; seguir el protocolo de coacción.`,
      });
      if (actual.prioridad > 1) await db.update(alarma).set({ prioridad: 1 }).where(eq(alarma.id, id));
    }
    return reply.code(201).send(fila);
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
    const [previa] = await db.select({ estado: alarma.estado, creadoEn: alarma.creadoEn, tomadaEn: alarma.tomadaEn }).from(alarma).where(eq(alarma.id, id)).limit(1);
    if (!previa) return reply.code(404).send({ error: 'Alarma no encontrada' });
    if (previa.estado === 'cerrada') return reply.code(409).send({ error: 'La alarma ya está cerrada' });
    const ahora = new Date();
    const texto = datos.data.resolucion?.trim() || null;
    const motivoEtiqueta = datos.data.motivo ? etiquetaMotivo(datos.data.desenlace, datos.data.motivo) : null;
    const [fila] = await db
      .update(alarma)
      .set({
        estado: 'cerrada',
        cerradaEn: ahora,
        desenlace: datos.data.desenlace,
        motivo: datos.data.motivo ?? null,
        // Lo que queda legible: el motivo fijo y, si lo hay, el detalle
        resolucion: [motivoEtiqueta, texto].filter(Boolean).join(' — ') || texto,
        // Cerrar sin haber tomado también cuenta como atención de quien cierra
        ...(previa.tomadaEn ? {} : { operadorId: request.user.id, tomadaEn: ahora }),
      })
      .where(eq(alarma.id, id))
      .returning();
    const tiempos = previa.tomadaEn
      ? `tras ${duracionTexto(ahora.getTime() - previa.tomadaEn.getTime())} en atención`
      : `sin haberse tomado, ${duracionTexto(ahora.getTime() - previa.creadoEn.getTime())} después de abrirse`;
    await db.insert(accionAlarma).values({
      alarmaId: id,
      operadorId: request.user.id,
      tipo: 'cierre',
      detalle: `${ETIQUETA_DESENLACE[datos.data.desenlace]} ${tiempos}: ${fila!.resolucion}`,
    });
    return fila;
  });

  /**
   * Marca un paso del protocolo como cumplido. No se guarda un estado aparte:
   * queda como entrada en la bitácora y de ahí se deduce qué está hecho, así
   * que no hay dos fuentes de verdad que puedan contradecirse.
   */
  app.post('/alarmas/:id/paso', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaPaso.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.select({ id: alarma.id }).from(alarma).where(eq(alarma.id, id)).limit(1);
    if (!fila) return reply.code(404).send({ error: 'Alarma no encontrada' });
    await db
      .insert(accionAlarma)
      .values({ alarmaId: id, operadorId: request.user.id, tipo: 'paso', detalle: datos.data.paso });
    return { ok: true };
  });

  /**
   * Lotes: varias alarmas del mismo sitio se toman o se cierran de una vez,
   * con la misma regla que de a una (cada una queda con su bitácora). Un
   * sensor con rebote genera diez filas; nadie debería cerrarlas de a una.
   */
  const esquemaLote = z.object({ ids: z.array(z.number().int()).min(1).max(200) });
  app.post('/alarmas/lote/tomar', async (request, reply) => {
    const datos = esquemaLote.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const ahora = new Date();
    const tomadas = await db
      .update(alarma)
      .set({ estado: 'en_atencion', operadorId: request.user.id, tomadaEn: ahora })
      .where(and(inArray(alarma.id, datos.data.ids), eq(alarma.estado, 'nueva')))
      .returning({ id: alarma.id, creadoEn: alarma.creadoEn });
    if (tomadas.length) {
      await db.insert(accionAlarma).values(
        tomadas.map((t) => ({
          alarmaId: t.id,
          operadorId: request.user.id,
          tipo: 'toma' as const,
          detalle: `Tomada en lote tras ${duracionTexto(ahora.getTime() - t.creadoEn.getTime())} de espera`,
        })),
      );
    }
    return { tomadas: tomadas.length, omitidas: datos.data.ids.length - tomadas.length };
  });

  app.post('/alarmas/lote/cerrar', async (request, reply) => {
    const datos = esquemaLote.merge(esquemaCierre.innerType()).safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const validacion = esquemaCierre.safeParse(datos.data);
    if (!validacion.success) return reply.code(400).send({ error: validacion.error.issues });
    const ahora = new Date();
    const texto = datos.data.resolucion?.trim() || null;
    const motivoEtiqueta = datos.data.motivo ? etiquetaMotivo(datos.data.desenlace, datos.data.motivo) : null;
    const resolucion = [motivoEtiqueta, texto].filter(Boolean).join(' — ') || texto;
    const previas = await db
      .select({ id: alarma.id, tomadaEn: alarma.tomadaEn, creadoEn: alarma.creadoEn })
      .from(alarma)
      .where(and(inArray(alarma.id, datos.data.ids), ne(alarma.estado, 'cerrada')));
    for (const p of previas) {
      await db
        .update(alarma)
        .set({
          estado: 'cerrada',
          cerradaEn: ahora,
          desenlace: datos.data.desenlace,
          motivo: datos.data.motivo ?? null,
          resolucion,
          ...(p.tomadaEn ? {} : { operadorId: request.user.id, tomadaEn: ahora }),
        })
        .where(eq(alarma.id, p.id));
      await db.insert(accionAlarma).values({
        alarmaId: p.id,
        operadorId: request.user.id,
        tipo: 'cierre',
        detalle: `${ETIQUETA_DESENLACE[datos.data.desenlace]} en lote de ${previas.length}: ${resolucion}`,
      });
    }
    return { cerradas: previas.length, omitidas: datos.data.ids.length - previas.length };
  });

  /** Reabrir una alarma cerrada por error: vuelve a atención de quien la reabre, con rastro. */
  app.post('/alarmas/:id/reabrir', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db
      .update(alarma)
      .set({ estado: 'en_atencion', operadorId: request.user.id, tomadaEn: new Date(), cerradaEn: null, desenlace: null, motivo: null, resolucion: null })
      .where(and(eq(alarma.id, id), eq(alarma.estado, 'cerrada')))
      .returning();
    if (!fila) return reply.code(409).send({ error: 'Solo se reabre una alarma cerrada' });
    await db.insert(accionAlarma).values({ alarmaId: id, operadorId: request.user.id, tipo: 'sistema', detalle: 'Reabierta' });
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
        prefijo: panel.prefijo,
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
