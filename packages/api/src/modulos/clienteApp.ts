import { and, desc, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { acceso, alarma, auditoria, cliente, contacto, db, evento, hashearClave, panel, preferenciaAviso, sitio, usuario, zona } from '@monitoring/db';
import { abrirAlarma } from '@monitoring/engine';
import type { App } from '../tipos.js';

/**
 * API de la app de clientes. El alcance sale de la tabla `acceso` en CADA
 * pedido (revocar un permiso corta el acceso al instante): una fila con
 * panelId da solo ese panel; con sitioId, ese sitio; con ambos NULL, todo
 * el cliente. Un usuario puede tener accesos sobre varios clientes.
 */
export function registrarClienteApp(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', async (request, reply) => {
    if (request.user.rol !== 'cliente') {
      return reply.code(403).send({ error: 'Solo usuarios de la app de clientes' });
    }
  });

  /** Paneles visibles para el usuario según sus accesos (la única guardia de aislamiento). */
  async function panelesDelUsuario(usuarioId: number) {
    return db
      .selectDistinctOn([panel.id], {
        id: panel.id,
        numeroCuenta: panel.numeroCuenta,
        prefijo: panel.prefijo,
        tipo: panel.tipo,
        activo: panel.activo,
        ultimaSenalEn: panel.ultimaSenalEn,
        sitioId: sitio.id,
        sitioNombre: sitio.nombre,
        sitioDireccion: sitio.direccion,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
      })
      .from(panel)
      .innerJoin(sitio, eq(panel.sitioId, sitio.id))
      .innerJoin(cliente, eq(sitio.clienteId, cliente.id))
      .innerJoin(
        acceso,
        and(
          eq(acceso.usuarioId, usuarioId),
          eq(acceso.clienteId, cliente.id),
          or(
            eq(acceso.panelId, panel.id),
            and(isNull(acceso.panelId), eq(acceso.sitioId, sitio.id)),
            and(isNull(acceso.panelId), isNull(acceso.sitioId)),
          ),
        ),
      );
  }

  app.get('/cliente/resumen', async (request) => {
    const paneles = await panelesDelUsuario(request.user.id);

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

    return { paneles: conEstado, propietarioDe: await clientesPropietario(request.user.id) };
  });

  // ---- Autogestión del propietario: usuarios de la app y lista de llamadas ----

  /** Clientes de los que este usuario es propietario (acceso a todo el cliente marcado como tal). */
  async function clientesPropietario(usuarioId: number): Promise<number[]> {
    const filas = await db
      .select({ clienteId: acceso.clienteId })
      .from(acceso)
      .where(and(eq(acceso.usuarioId, usuarioId), eq(acceso.propietario, true), isNull(acceso.sitioId), isNull(acceso.panelId)));
    return [...new Set(filas.map((f) => f.clienteId))];
  }

  /** 403 si el usuario no es propietario de ese cliente. */
  async function exigirPropietario(request: { user: { id: number } }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }, clienteId: number) {
    const propios = await clientesPropietario(request.user.id);
    if (!propios.includes(clienteId)) {
      reply.code(403).send({ error: 'Solo el propietario de la cuenta puede hacer esto' });
      return false;
    }
    return true;
  }

  async function registrarAuditoria(usuarioId: number, entidad: string, entidadId: number | null, accion: 'crear' | 'editar' | 'eliminar', cambios: unknown) {
    await db.insert(auditoria).values({ usuarioId, entidad, entidadId, accion, cambios: cambios as never });
  }

  /**
   * Un cambio en la lista de llamadas hecho por el cliente le llega a la
   * central como evento de sistema (sin alarma): queda en el diario y en el
   * historial de la cuenta, para que un operador lo revise si quiere.
   */
  async function avisarCentralLlamadas(clienteId: number, quien: string, detalle: string) {
    const [p] = await db
      .select({ id: panel.id, numeroCuenta: panel.numeroCuenta })
      .from(panel)
      .innerJoin(sitio, eq(panel.sitioId, sitio.id))
      .where(and(eq(sitio.clienteId, clienteId), eq(panel.activo, true)))
      .orderBy(panel.id)
      .limit(1);
    await db.insert(evento).values({
      panelId: p?.id,
      numeroCuenta: p?.numeroCuenta,
      categoria: 'sistema',
      codigo: 'CLI-LLAM',
      descripcion: `Lista de llamadas modificada desde la app por ${quien}: ${detalle}`,
      prioridad: 4,
      ocurridoEn: new Date(),
    });
  }

  app.get('/cliente/usuarios', async (request) => {
    const propios = await clientesPropietario(request.user.id);
    if (propios.length === 0) return [];
    return db
      .select({
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        activo: usuario.activo,
        clienteId: acceso.clienteId,
        clienteNombre: cliente.nombre,
        propietario: acceso.propietario,
        sitioId: acceso.sitioId,
        sitioNombre: sitio.nombre,
        panelId: acceso.panelId,
      })
      .from(acceso)
      .innerJoin(usuario, eq(acceso.usuarioId, usuario.id))
      .innerJoin(cliente, eq(acceso.clienteId, cliente.id))
      .leftJoin(sitio, eq(acceso.sitioId, sitio.id))
      .where(and(inArray(acceso.clienteId, propios), eq(usuario.rol, 'cliente')))
      .orderBy(desc(acceso.propietario), usuario.nombre);
  });

  const esquemaAltaUsuario = z.object({
    clienteId: z.number().int(),
    nombre: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    clave: z.string().min(6).max(100),
    sitioId: z.number().int().optional(),
  });
  app.post('/cliente/usuarios', async (request, reply) => {
    const datos = esquemaAltaUsuario.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    if (!(await exigirPropietario(request, reply, datos.data.clienteId))) return;
    if (datos.data.sitioId) {
      const [s] = await db.select({ id: sitio.id }).from(sitio).where(and(eq(sitio.id, datos.data.sitioId), eq(sitio.clienteId, datos.data.clienteId))).limit(1);
      if (!s) return reply.code(400).send({ error: 'Ese sitio no es de su cuenta' });
    }
    // Si el correo ya tiene cuenta de la app, solo se le da acceso; nunca a personal de la central
    const [existente] = await db.select({ id: usuario.id, rol: usuario.rol }).from(usuario).where(eq(usuario.email, datos.data.email)).limit(1);
    let usuarioId: number;
    if (existente) {
      if (existente.rol !== 'cliente') return reply.code(409).send({ error: 'Ese correo no se puede usar' });
      usuarioId = existente.id;
    } else {
      const [nuevo] = await db
        .insert(usuario)
        .values({ email: datos.data.email, nombre: datos.data.nombre, rol: 'cliente', hashClave: hashearClave(datos.data.clave) })
        .returning({ id: usuario.id });
      usuarioId = nuevo!.id;
    }
    const [ya] = await db
      .select({ id: acceso.id })
      .from(acceso)
      .where(and(eq(acceso.usuarioId, usuarioId), eq(acceso.clienteId, datos.data.clienteId)))
      .limit(1);
    if (!ya) await db.insert(acceso).values({ usuarioId, clienteId: datos.data.clienteId, sitioId: datos.data.sitioId ?? null, propietario: false });
    await registrarAuditoria(request.user.id, 'usuario', usuarioId, 'crear', { desdeApp: true, clienteId: datos.data.clienteId, email: datos.data.email, sitioId: datos.data.sitioId ?? null });
    return reply.code(201).send({ id: usuarioId, nombre: datos.data.nombre, email: datos.data.email, activo: true });
  });

  const esquemaEstadoUsuario = z.object({ clienteId: z.number().int(), activo: z.boolean() });
  app.put('/cliente/usuarios/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaEstadoUsuario.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    if (!(await exigirPropietario(request, reply, datos.data.clienteId))) return;
    if (id === request.user.id) return reply.code(400).send({ error: 'No puede desactivar su propio usuario' });
    const [vinculo] = await db
      .select({ propietario: acceso.propietario, rol: usuario.rol })
      .from(acceso)
      .innerJoin(usuario, eq(acceso.usuarioId, usuario.id))
      .where(and(eq(acceso.usuarioId, id), eq(acceso.clienteId, datos.data.clienteId)))
      .limit(1);
    if (!vinculo || vinculo.rol !== 'cliente') return reply.code(404).send({ error: 'Usuario no encontrado en su cuenta' });
    if (vinculo.propietario) return reply.code(400).send({ error: 'A un propietario solo lo cambia la central' });
    await db.update(usuario).set({ activo: datos.data.activo }).where(eq(usuario.id, id));
    await registrarAuditoria(request.user.id, 'usuario', id, 'editar', { desdeApp: true, activo: datos.data.activo });
    return { id, activo: datos.data.activo };
  });

  app.get('/cliente/contactos', async (request) => {
    const propios = await clientesPropietario(request.user.id);
    if (propios.length === 0) return [];
    return db
      .select({
        id: contacto.id,
        clienteId: contacto.clienteId,
        sitioId: contacto.sitioId,
        nombre: contacto.nombre,
        rol: contacto.rol,
        telefono: contacto.telefono,
        telefonoAlternativo: contacto.telefonoAlternativo,
        orden: contacto.orden,
        autorizadoCancelar: contacto.autorizadoCancelar,
      })
      .from(contacto)
      .where(inArray(contacto.clienteId, propios))
      .orderBy(contacto.clienteId, contacto.orden, contacto.id);
  });

  const esquemaContactoApp = z.object({
    clienteId: z.number().int(),
    sitioId: z.number().int().nullable().optional(),
    nombre: z.string().trim().min(2).max(80),
    rol: z.string().trim().max(40).nullable().optional(),
    telefono: z.string().trim().min(6).max(30),
    telefonoAlternativo: z.string().trim().max(30).nullable().optional(),
    orden: z.number().int().min(1).max(99).optional(),
  });
  app.post('/cliente/contactos', async (request, reply) => {
    const datos = esquemaContactoApp.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    if (!(await exigirPropietario(request, reply, datos.data.clienteId))) return;
    const [fila] = await db
      .insert(contacto)
      .values({ ...datos.data, sitioId: datos.data.sitioId ?? null, rol: datos.data.rol ?? null, telefonoAlternativo: datos.data.telefonoAlternativo ?? null, orden: datos.data.orden ?? 1 })
      .returning();
    await registrarAuditoria(request.user.id, 'contacto', fila!.id, 'crear', { desdeApp: true, ...datos.data });
    await avisarCentralLlamadas(datos.data.clienteId, request.user.email, `agregó a ${datos.data.nombre} (${datos.data.telefono})`);
    return reply.code(201).send(fila);
  });

  app.put('/cliente/contactos/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaContactoApp.partial().safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [actual] = await db.select().from(contacto).where(eq(contacto.id, id)).limit(1);
    if (!actual) return reply.code(404).send({ error: 'Contacto no encontrado' });
    if (!(await exigirPropietario(request, reply, actual.clienteId))) return;
    const { clienteId: _c, ...cambios } = datos.data;
    const [fila] = await db.update(contacto).set(cambios).where(eq(contacto.id, id)).returning();
    await registrarAuditoria(request.user.id, 'contacto', id, 'editar', { desdeApp: true, antes: actual, despues: cambios });
    await avisarCentralLlamadas(actual.clienteId, request.user.email, `cambió a ${actual.nombre}${cambios.telefono && cambios.telefono !== actual.telefono ? ` (teléfono ${actual.telefono} → ${cambios.telefono})` : ''}`);
    return fila;
  });

  app.delete('/cliente/contactos/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [actual] = await db.select().from(contacto).where(eq(contacto.id, id)).limit(1);
    if (!actual) return reply.code(404).send({ error: 'Contacto no encontrado' });
    if (!(await exigirPropietario(request, reply, actual.clienteId))) return;
    await db.delete(contacto).where(eq(contacto.id, id));
    await registrarAuditoria(request.user.id, 'contacto', id, 'eliminar', { desdeApp: true, ...actual });
    await avisarCentralLlamadas(actual.clienteId, request.user.email, `quitó a ${actual.nombre} (${actual.telefono})`);
    return { eliminado: true };
  });

  /** Zonas del panel con su descripción, para la pantalla del panel en la app. */
  app.get('/cliente/paneles/:id/zonas', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const paneles = await panelesDelUsuario(request.user.id);
    if (!paneles.some((p) => p.id === id)) return reply.code(404).send({ error: 'Panel no encontrado' });
    return db.select({ numero: zona.numero, descripcion: zona.descripcion }).from(zona).where(eq(zona.panelId, id)).orderBy(zona.numero);
  });

  app.get('/cliente/eventos', async (request) => {
    const { limite, panelId } = request.query as { limite?: string; panelId?: string };
    const max = Math.min(Number(limite ?? 50), 200);
    let paneles = await panelesDelUsuario(request.user.id);
    // Filtro por equipo, siempre dentro de los que el usuario alcanza
    if (panelId) paneles = paneles.filter((p) => p.id === Number(panelId));
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
        prefijo: panel.prefijo,
      })
      .from(evento)
      .leftJoin(zona, and(eq(zona.panelId, evento.panelId), eq(zona.numero, evento.zona), notInArray(evento.categoria, ['apertura', 'cierre'])))
      .leftJoin(panel, eq(evento.panelId, panel.id))
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
    const paneles = await panelesDelUsuario(request.user.id);
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

  /**
   * Preferencias de avisos del usuario. Las lee la app al arrancar y las
   * usará el envío push: lo que el usuario apagó no le llega por ningún canal.
   */
  const PREFERENCIAS_POR_DEFECTO = { armadoDesarmado: true, averias: true, sistema: true, silencioDesde: null, silencioHasta: null };
  const hora = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
  const esquemaPreferencias = z
    .object({
      armadoDesarmado: z.boolean(),
      averias: z.boolean(),
      sistema: z.boolean(),
      silencioDesde: hora.nullable(),
      silencioHasta: hora.nullable(),
    })
    .refine((p) => (p.silencioDesde === null) === (p.silencioHasta === null), { message: 'La franja de silencio necesita inicio y fin' });

  app.get('/cliente/preferencias', async (request) => {
    const [fila] = await db.select().from(preferenciaAviso).where(eq(preferenciaAviso.usuarioId, request.user.id)).limit(1);
    if (!fila) return PREFERENCIAS_POR_DEFECTO;
    const { usuarioId: _u, actualizadoEn: _a, ...resto } = fila;
    return resto;
  });

  app.put('/cliente/preferencias', async (request, reply) => {
    const datos = esquemaPreferencias.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db
      .insert(preferenciaAviso)
      .values({ usuarioId: request.user.id, ...datos.data, actualizadoEn: new Date() })
      .onConflictDoUpdate({ target: preferenciaAviso.usuarioId, set: { ...datos.data, actualizadoEn: new Date() } })
      .returning();
    const { usuarioId: _u, actualizadoEn: _a, ...resto } = fila!;
    return resto;
  });

  const esquemaPanico = z.object({ sitioId: z.number().int() });

  /** Botón de pánico: entra a la cola del operador como prioridad máxima. */
  app.post('/cliente/panico', async (request, reply) => {
    const datos = esquemaPanico.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'sitioId requerido' });

    // El sitio tiene que estar dentro de los accesos del usuario
    const paneles = await panelesDelUsuario(request.user.id);
    const delSitio = paneles.filter((p) => p.sitioId === datos.data.sitioId);
    if (delSitio.length === 0) return reply.code(404).send({ error: 'Sitio no encontrado' });
    const referencia = delSitio[0]!;

    const descripcion = `BOTÓN DE PÁNICO (app): ${request.user.email} — ${referencia.sitioNombre}${
      referencia.sitioDireccion ? `, ${referencia.sitioDireccion}` : ''
    }`;
    const [filaEvento] = await db
      .insert(evento)
      .values({
        panelId: referencia.id,
        numeroCuenta: referencia.numeroCuenta,
        categoria: 'alarma',
        codigo: 'PANICO',
        descripcion,
        prioridad: 1,
        ocurridoEn: new Date(),
      })
      .returning({ id: evento.id });

    const alarmaId = await abrirAlarma({
      eventoId: filaEvento!.id,
      panelId: referencia.id,
      prioridad: 1,
      descripcion,
      numeroCuenta: referencia.numeroCuenta,
    });

    return reply.code(201).send({ alarmaId, recibido: true });
  });
}
