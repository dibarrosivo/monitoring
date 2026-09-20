import { and, desc, eq, getTableColumns, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  alarma,
  auditoria,
  catalogo,
  cliente,
  contacto,
  db,
  feriado,
  horario,
  panel,
  sitio,
  usuario,
  usuarioPanel,
  zona,
} from '@monitoring/db';
import type { App } from '../tipos.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

function idDe(request: FastifyRequest): number {
  return Number((request.params as { id: string }).id);
}

/** Deja constancia de quién cambió qué: obligatorio en una empresa de seguridad. */
async function auditar(
  request: FastifyRequest,
  entidad: string,
  entidadId: number | null,
  accion: 'crear' | 'editar' | 'eliminar',
  cambios?: unknown,
): Promise<void> {
  await db.insert(auditoria).values({
    usuarioId: request.user?.id ?? null,
    entidad,
    entidadId,
    accion,
    cambios: (cambios ?? null) as never,
  });
}

/** Actualización genérica: parsea, actualiza, audita y responde 404 si no existe.
 *  (la tabla llega sin tipar: drizzle no acepta una unión de tablas en update/delete) */
async function actualizar(
  request: FastifyRequest,
  reply: FastifyReply,
  esquema: z.ZodTypeAny,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tabla: any,
  entidad: string,
) {
  const datos = esquema.safeParse(request.body);
  if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (await db.update(tabla).set(datos.data).where(eq(tabla.id, idDe(request))).returning()) as any[];
  if (!filas[0]) return reply.code(404).send({ error: 'No encontrado' });
  await auditar(request, entidad, idDe(request), 'editar', datos.data);
  return filas[0];
}

/** Borrado físico solo para entidades sin historial; 409 si algo depende de ella. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function borrar(request: FastifyRequest, reply: FastifyReply, tabla: any, entidad: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas = (await db.delete(tabla).where(eq(tabla.id, idDe(request))).returning()) as any[];
    if (!filas[0]) return reply.code(404).send({ error: 'No encontrado' });
    await auditar(request, entidad, idDe(request), 'eliminar', filas[0]);
    return { eliminado: true };
  } catch {
    return reply.code(409).send({ error: 'Tiene registros asociados; no se puede eliminar' });
  }
}

const esquemaCliente = z.object({
  nombre: z.string().min(1),
  documento: z.string().optional(),
  tipoPersona: z.enum(['natural', 'juridico', 'gobierno', 'otro']).optional(),
  telefono: z.string().optional(),
  movil: z.string().optional(),
  email: z.string().email().optional(),
  direccion: z.string().optional(),
  notas: z.string().optional(),
  instrucciones: z.string().optional(),
  fechaAlta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Cambio de estado comercial: siempre con motivo y fecha. */
const esquemaEstadoCliente = z.object({
  estado: z.enum(['activo', 'suspendido', 'baja']),
  motivoEstado: z.string().optional(),
});

const camposSitio = {
  nombre: z.string().min(1),
  tipo: z.enum(['residencial', 'comercial', 'industria', 'gobierno', 'apartamento', 'centro_comercial', 'otro']).optional(),
  direccion: z.string().optional(),
  ciudad: z.string().optional(),
  referencia: z.string().optional(),
  latitud: z.number().min(-90).max(90).nullable().optional(),
  longitud: z.number().min(-180).max(180).nullable().optional(),
  telefono: z.string().optional(),
  zonaHoraria: z.string().max(64).nullable().optional(),
  llaves: z.string().optional(),
  puntoTag: z.string().optional(),
  instruccionesAcceso: z.string().optional(),
  instrucciones: z.string().optional(),
  notas: z.string().optional(),
};

const esquemaSitio = z.object({ clienteId: z.number().int(), ...camposSitio });

const camposPanel = {
  numeroCuenta: z.string().regex(/^[0-9A-Fa-f]{3,16}$/),
  /** Segundo número con el que el mismo equipo puede reportar (otra vía de comunicación) */
  cuentaSecundaria: z.string().regex(/^[0-9A-Fa-f]{3,16}$/).nullable().optional(),
  prefijo: z.string().max(8).optional(),
  alias: z.string().optional(),
  tipo: z.enum(['hikvision', 'pima', 'ebs', 'otro']).default('otro'),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  serial: z.string().optional(),
  claveMaestra: z.string().optional(),
  instalador: z.string().optional(),
  fechaInstalacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  propiedad: z.enum(['propio', 'comodato', 'prestamo']).optional(),
  supervisado: z.boolean().default(true),
  intervaloPruebaMin: z.number().int().positive().default(1440),
  ventanaCancelacionSeg: z.number().int().min(0).max(300).default(45),
  montoAbono: z.union([z.number(), z.string()]).transform(String).optional(),
  frecuenciaMeses: z.number().int().min(1).max(24).optional(),
  proximoVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
};

const esquemaPanel = z.object({ sitioId: z.number().int(), ...camposPanel });

const esquemaZona = z.object({
  panelId: z.number().int(),
  numero: z.string().min(1).max(8),
  particion: z.string().max(4).default('01'),
  descripcion: z.string().optional(),
});

const esquemaContacto = z.object({
  clienteId: z.number().int(),
  sitioId: z.number().int().optional(),
  nombre: z.string().min(1),
  rol: z.string().optional(),
  telefono: z.string().min(1),
  telefonoAlternativo: z.string().optional(),
  email: z.string().email().optional(),
  orden: z.number().int().positive().default(1),
  palabraClave: z.string().optional(),
  autorizadoCancelar: z.boolean().optional(),
  notas: z.string().optional(),
});

/**
 * Guarda los valores nuevos de marca/modelo/instalador para ofrecerlos como
 * sugerencia la próxima vez. El catálogo se alimenta solo: nadie mantiene listas.
 */
async function recordarCatalogo(datos: { marca?: string | null; modelo?: string | null; instalador?: string | null }) {
  const entradas: { tipo: string; valor: string }[] = [];
  for (const tipo of ['marca', 'modelo', 'instalador'] as const) {
    const valor = datos[tipo]?.trim();
    if (valor) entradas.push({ tipo, valor });
  }
  if (entradas.length === 0) return;
  await db.insert(catalogo).values(entradas).onConflictDoNothing();
}

/**
 * Ni la cuenta principal ni la secundaria pueden repetirse en otro equipo DEL
 * MISMO TIPO: dos señales con ese número por la misma vía no tendrían dueño
 * único y el operador vería el sitio equivocado. Entre tipos distintos sí se
 * admite, porque llegan por vías distintas y la vía desempata (la 7037 es a
 * la vez un Hikvision de prueba y un transmisor EBS de otro cliente).
 */
async function cuentasEnConflicto(
  datos: { numeroCuenta?: string; cuentaSecundaria?: string | null; tipo?: string },
  excluirPanelId?: number,
): Promise<string | null> {
  // Al editar, lo que no viene en el pedido se toma del equipo tal como está:
  // cambiar solo el tipo también puede chocar con otro equipo del mismo número
  let { numeroCuenta, cuentaSecundaria, tipo: tipoPropio } = datos;
  if (excluirPanelId && (numeroCuenta === undefined || tipoPropio === undefined)) {
    const [actual] = await db
      .select({ numeroCuenta: panel.numeroCuenta, cuentaSecundaria: panel.cuentaSecundaria, tipo: panel.tipo })
      .from(panel)
      .where(eq(panel.id, excluirPanelId))
      .limit(1);
    numeroCuenta ??= actual?.numeroCuenta;
    if (cuentaSecundaria === undefined) cuentaSecundaria = actual?.cuentaSecundaria;
    tipoPropio ??= actual?.tipo;
  }
  const buscadas = [numeroCuenta, cuentaSecundaria].filter((c): c is string => Boolean(c));
  if (buscadas.length === 0) return null;
  if (buscadas.length === 2 && buscadas[0] === buscadas[1]) {
    return 'La cuenta secundaria no puede ser igual a la principal';
  }
  tipoPropio ??= 'otro';
  const filas = await db
    .select({ id: panel.id, numeroCuenta: panel.numeroCuenta, cuentaSecundaria: panel.cuentaSecundaria, tipo: panel.tipo })
    .from(panel)
    .where(or(inArray(panel.numeroCuenta, buscadas), inArray(panel.cuentaSecundaria, buscadas)));
  const choque = filas.find((f) => f.id !== excluirPanelId && f.tipo === tipoPropio);
  if (!choque) return null;
  return `La cuenta ya está asignada a otro equipo ${NOMBRE_TIPO[choque.tipo] ?? choque.tipo} (${choque.numeroCuenta})`;
}

const NOMBRE_TIPO: Record<string, string> = { hikvision: 'Hikvision', pima: 'PIMA', ebs: 'EBS', otro: 'de otro tipo' };

export function registrarClientes(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  /** Lista de clientes con el resumen a simple vista: sitios, dispositivos, salud y alarmas. */
  app.get('/clientes', async () =>
    db
      .select({
        ...getTableColumns(cliente),
        sitios: sql<number>`count(distinct ${sitio.id})`.mapWith(Number),
        dispositivos: sql<number>`count(distinct ${panel.id})`.mapWith(Number),
        silenciosos: sql<number>`count(distinct ${panel.id}) filter (where ${panel.activo} and ${panel.supervisado} and coalesce(${panel.ultimaSenalEn}, ${panel.creadoEn}) < now() - (${panel.intervaloPruebaMin} * interval '90 seconds'))`.mapWith(Number),
        alarmasAbiertas: sql<number>`count(distinct ${alarma.id}) filter (where ${alarma.estado} <> 'cerrada')`.mapWith(Number),
        vencidos: sql<number>`count(distinct ${panel.id}) filter (where ${panel.proximoVencimiento} is not null and ${panel.proximoVencimiento} < current_date)`.mapWith(Number),
        proximoVencimiento: sql<string | null>`min(${panel.proximoVencimiento}) filter (where ${panel.activo})`,
        abonoTotal: sql<string | null>`sum(${panel.montoAbono}) filter (where ${panel.activo})`,
      })
      .from(cliente)
      .leftJoin(sitio, eq(sitio.clienteId, cliente.id))
      .leftJoin(panel, eq(panel.sitioId, sitio.id))
      .leftJoin(alarma, eq(alarma.panelId, panel.id))
      .groupBy(cliente.id)
      .orderBy(cliente.nombre),
  );

  /** Búsqueda global: clientes, sitios, paneles y contactos, agrupados. */
  app.get('/buscar', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const termino = (q ?? '').trim();
    if (termino.length < 2) return reply.code(400).send({ error: 'Mínimo 2 caracteres' });
    const patron = `%${termino}%`;

    const [clientes, sitios, paneles, contactos] = await Promise.all([
      db
        .select({ id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono })
        .from(cliente)
        .where(or(ilike(cliente.nombre, patron), ilike(cliente.telefono, patron), ilike(cliente.email, patron)))
        .limit(6),
      db
        .select({ id: sitio.id, nombre: sitio.nombre, direccion: sitio.direccion, clienteId: sitio.clienteId })
        .from(sitio)
        .where(or(ilike(sitio.nombre, patron), ilike(sitio.direccion, patron)))
        .limit(6),
      db
        .select({ id: panel.id, numeroCuenta: panel.numeroCuenta, prefijo: panel.prefijo, tipo: panel.tipo, clienteId: sitio.clienteId, sitioNombre: sitio.nombre })
        .from(panel)
        .innerJoin(sitio, eq(panel.sitioId, sitio.id))
        .where(ilike(panel.numeroCuenta, patron))
        .limit(6),
      db
        .select({ id: contacto.id, nombre: contacto.nombre, telefono: contacto.telefono, clienteId: contacto.clienteId })
        .from(contacto)
        .where(or(ilike(contacto.nombre, patron), ilike(contacto.telefono, patron)))
        .limit(6),
    ]);

    return { clientes, sitios, paneles, contactos };
  });

  app.post('/clientes', async (request, reply) => {
    const datos = esquemaCliente.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.insert(cliente).values(datos.data).returning();
    return reply.code(201).send(fila);
  });

  app.get('/clientes/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db.select().from(cliente).where(eq(cliente.id, id)).limit(1);
    if (!fila) return reply.code(404).send({ error: 'Cliente no encontrado' });
    const sitios = await db.select().from(sitio).where(eq(sitio.clienteId, id));
    const contactos = await db.select().from(contacto).where(eq(contacto.clienteId, id)).orderBy(contacto.orden);
    return { ...fila, sitios, contactos };
  });

  app.post('/sitios', async (request, reply) => {
    const datos = esquemaSitio.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.insert(sitio).values(datos.data).returning();
    return reply.code(201).send(fila);
  });

  app.get('/paneles', async () => db.select().from(panel).orderBy(panel.numeroCuenta));

  /**
   * Cuenta en prueba: el técnico está en el sitio y va a disparar de todo.
   * Por N horas las señales se registran sin abrir alarma ni supervisar
   * silencio u horarios; vence sola. Queda en auditoría quién la puso.
   */
  const esquemaPrueba = z.object({ horas: z.number().min(0.25).max(72), motivo: z.string().trim().min(1).max(200) });
  app.post('/paneles/:id/prueba', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaPrueba.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const hasta = new Date(Date.now() + datos.data.horas * 3_600_000);
    const [fila] = await db.update(panel).set({ enPruebaHasta: hasta, enPruebaMotivo: datos.data.motivo }).where(eq(panel.id, id)).returning();
    if (!fila) return reply.code(404).send({ error: 'Panel no encontrado' });
    await auditar(request, 'panel', id, 'editar', { enPrueba: true, hasta: hasta.toISOString(), motivo: datos.data.motivo });
    return fila;
  });
  app.delete('/paneles/:id/prueba', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db.update(panel).set({ enPruebaHasta: null, enPruebaMotivo: null }).where(eq(panel.id, id)).returning();
    if (!fila) return reply.code(404).send({ error: 'Panel no encontrado' });
    await auditar(request, 'panel', id, 'editar', { enPrueba: false });
    return fila;
  });

  app.post('/paneles', async (request, reply) => {
    const datos = esquemaPanel.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const conflicto = await cuentasEnConflicto(datos.data);
    if (conflicto) return reply.code(409).send({ error: conflicto });
    const [fila] = await db.insert(panel).values(datos.data).returning();
    await recordarCatalogo(datos.data);
    return reply.code(201).send(fila);
  });

  app.get('/paneles/:id/zonas', async (request) => {
    const id = Number((request.params as { id: string }).id);
    return db.select().from(zona).where(eq(zona.panelId, id));
  });

  app.post('/zonas', async (request, reply) => {
    const datos = esquemaZona.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.insert(zona).values(datos.data).returning();
    return reply.code(201).send(fila);
  });

  app.post('/contactos', async (request, reply) => {
    const datos = esquemaContacto.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.insert(contacto).values(datos.data).returning();
    return reply.code(201).send(fila);
  });

  // ---- Edición y baja ----
  app.put('/clientes/:id', (req, res) => actualizar(req, res, esquemaCliente.partial(), cliente, 'cliente'));
  app.put('/sitios/:id', (req, res) => actualizar(req, res, z.object(camposSitio).partial(), sitio, 'sitio'));
  app.delete('/sitios/:id', (req, res) => borrar(req, res, sitio, 'sitio'));
  app.put('/paneles/:id', async (req, res) => {
    const id = Number((req.params as { id: string }).id);
    const cuerpo = req.body as { numeroCuenta?: string; cuentaSecundaria?: string | null; tipo?: string };
    const conflicto = await cuentasEnConflicto(cuerpo ?? {}, id);
    if (conflicto) return res.code(409).send({ error: conflicto });
    const resultado = await actualizar(
      req,
      res,
      z.object(camposPanel).partial().extend({ activo: z.boolean().optional() }),
      panel,
      'panel',
    );
    await recordarCatalogo((cuerpo ?? {}) as Record<string, string>);
    return resultado;
  });
  app.put('/zonas/:id', (req, res) => actualizar(req, res, esquemaZona.omit({ panelId: true }).partial(), zona, 'zona'));
  app.delete('/zonas/:id', (req, res) => borrar(req, res, zona, 'zona'));
  app.put('/contactos/:id', (req, res) => actualizar(req, res, esquemaContacto.omit({ clienteId: true }).partial(), contacto, 'contacto'));
  app.delete('/contactos/:id', (req, res) => borrar(req, res, contacto, 'contacto'));

  // ---- Horarios de apertura/cierre ----
  const esquemaHorario = z.object({
    panelId: z.number().int(),
    dias: z.string().regex(/^[LMXJVSD-]{7}$/),
    apertura: z.string().regex(/^\d{2}:\d{2}$/),
    cierre: z.string().regex(/^\d{2}:\d{2}$/),
    toleranciaMin: z.number().int().positive().max(240).default(30),
  });

  app.get('/paneles/:id/horarios', async (request) =>
    db.select().from(horario).where(eq(horario.panelId, idDe(request))),
  );

  app.post('/horarios', async (request, reply) => {
    const datos = esquemaHorario.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.insert(horario).values(datos.data).returning();
    return reply.code(201).send(fila);
  });

  app.put('/horarios/:id', (req, res) =>
    actualizar(req, res, esquemaHorario.omit({ panelId: true }).partial().extend({ activo: z.boolean().optional() }), horario, 'horario'),
  );
  app.delete('/horarios/:id', (req, res) => borrar(req, res, horario, 'horario'));

  /**
   * Alta en un paso: cliente + sitio + dispositivo (+ contacto opcional).
   * Es como ocurre en la realidad — el técnico termina la instalación y se
   * carga todo junto — en lugar de cuatro formularios encadenados.
   */
  const esquemaAlta = z.object({
    cliente: esquemaCliente,
    sitio: z.object(camposSitio).partial().extend({ nombre: z.string().min(1).default('Principal') }),
    dispositivo: z.object(camposPanel),
    contacto: esquemaContacto.omit({ clienteId: true, sitioId: true }).optional(),
  });

  app.post('/altas', async (request, reply) => {
    const datos = esquemaAlta.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });

    try {
      const resultado = await db.transaction(async (tx) => {
        const [filaCliente] = await tx.insert(cliente).values(datos.data.cliente).returning();
        const [filaSitio] = await tx
          .insert(sitio)
          .values({ ...datos.data.sitio, clienteId: filaCliente!.id })
          .returning();
        const [filaPanel] = await tx
          .insert(panel)
          .values({ ...datos.data.dispositivo, sitioId: filaSitio!.id })
          .returning();
        if (datos.data.contacto) {
          await tx.insert(contacto).values({ ...datos.data.contacto, clienteId: filaCliente!.id, sitioId: filaSitio!.id });
        }
        return { cliente: filaCliente!, sitio: filaSitio!, dispositivo: filaPanel! };
      });
      await auditar(request, 'cliente', resultado.cliente.id, 'crear', { alta: true, cuenta: resultado.dispositivo.numeroCuenta });
      return reply.code(201).send(resultado);
    } catch (err) {
      const mensaje = err instanceof Error && /numero_cuenta/.test(err.message)
        ? 'Ya existe un dispositivo con ese número de cuenta'
        : 'No se pudo completar el alta';
      return reply.code(409).send({ error: mensaje });
    }
  });

  /** Cambio de estado comercial, siempre con motivo y fecha. */
  app.put('/clientes/:id/estado', async (request, reply) => {
    const datos = esquemaEstadoCliente.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db
      .update(cliente)
      .set({
        estado: datos.data.estado,
        motivoEstado: datos.data.motivoEstado ?? null,
        estadoDesde: new Date(),
        // 'activo' del registro acompaña al estado: baja = inactivo
        activo: datos.data.estado !== 'baja',
      })
      .where(eq(cliente.id, idDe(request)))
      .returning();
    if (!fila) return reply.code(404).send({ error: 'Cliente no encontrado' });
    await auditar(request, 'cliente', fila.id, 'editar', datos.data);
    return fila;
  });

  /** Registrar el pago de una cuenta: corre el vencimiento según su frecuencia. */
  app.post('/paneles/:id/pago', async (request, reply) => {
    const id = idDe(request);
    const [fila] = await db.select().from(panel).where(eq(panel.id, id)).limit(1);
    if (!fila) return reply.code(404).send({ error: 'Dispositivo no encontrado' });

    const base = fila.proximoVencimiento ? new Date(`${fila.proximoVencimiento}T00:00:00Z`) : new Date();
    base.setUTCMonth(base.getUTCMonth() + fila.frecuenciaMeses);
    const nuevo = base.toISOString().slice(0, 10);

    const [actualizado] = await db
      .update(panel)
      .set({ proximoVencimiento: nuevo })
      .where(eq(panel.id, id))
      .returning();
    await auditar(request, 'panel', id, 'editar', { pago: true, proximoVencimiento: nuevo });
    return actualizado;
  });

  // ---- Feriados: el vigilante de horarios los saltea ----
  const esquemaFeriado = z.object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    descripcion: z.string().optional(),
  });

  // Sugerencias para los campos libres del equipo (marca, modelo, instalador).
  app.get('/catalogos', async (request) => {
    const { tipo } = request.query as { tipo?: string };
    const filas = await db
      .select({ tipo: catalogo.tipo, valor: catalogo.valor })
      .from(catalogo)
      .where(tipo ? eq(catalogo.tipo, tipo) : undefined)
      .orderBy(catalogo.valor);
    return filas;
  });

  app.get('/feriados', async () => db.select().from(feriado).orderBy(feriado.fecha));

  app.post('/feriados', async (request, reply) => {
    const datos = esquemaFeriado.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    try {
      const [fila] = await db.insert(feriado).values(datos.data).returning();
      await auditar(request, 'feriado', fila!.id, 'crear', datos.data);
      return reply.code(201).send(fila);
    } catch {
      return reply.code(409).send({ error: 'Ese feriado ya está cargado' });
    }
  });

  app.delete('/feriados/:id', (req, res) => borrar(req, res, feriado, 'feriado'));

  /** Historial de cambios administrativos de una entidad. */
  app.get('/auditoria', async (request) => {
    const { entidad, entidadId, limite } = request.query as { entidad?: string; entidadId?: string; limite?: string };
    const max = Math.min(Number(limite ?? 50), 200);
    const base = db
      .select({
        id: auditoria.id,
        entidad: auditoria.entidad,
        entidadId: auditoria.entidadId,
        accion: auditoria.accion,
        cambios: auditoria.cambios,
        creadoEn: auditoria.creadoEn,
        usuarioNombre: usuario.nombre,
      })
      .from(auditoria)
      .leftJoin(usuario, eq(auditoria.usuarioId, usuario.id));
    const filtrada =
      entidad && entidadId
        ? base.where(and(eq(auditoria.entidad, entidad), eq(auditoria.entidadId, Number(entidadId))))
        : base;
    return filtrada.orderBy(desc(auditoria.creadoEn)).limit(max);
  });

  // ---- Usuarios del panel físico (códigos del teclado) ----
  const esquemaUsuarioPanel = z.object({
    panelId: z.number().int(),
    /** Se normaliza a 3 dígitos: los eventos Contact ID transmiten '005' */
    numero: z
      .string()
      .regex(/^\d{1,4}$/)
      .transform((n) => n.padStart(3, '0')),
    nombre: z.string().min(1),
    telefono: z.string().optional(),
    contactoId: z.number().int().optional(),
  });

  app.get('/paneles/:id/usuarios-panel', async (request) =>
    db.select().from(usuarioPanel).where(eq(usuarioPanel.panelId, idDe(request))).orderBy(usuarioPanel.numero),
  );

  app.post('/usuarios-panel', async (request, reply) => {
    const datos = esquemaUsuarioPanel.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    try {
      const [fila] = await db.insert(usuarioPanel).values(datos.data).returning();
      return reply.code(201).send(fila);
    } catch {
      return reply.code(409).send({ error: 'Ese número de usuario ya existe en el panel' });
    }
  });

  app.put('/usuarios-panel/:id', (req, res) => actualizar(req, res, esquemaUsuarioPanel.omit({ panelId: true }).partial(), usuarioPanel, 'usuario_panel'));
  app.delete('/usuarios-panel/:id', (req, res) => borrar(req, res, usuarioPanel, 'usuario_panel'));
}
