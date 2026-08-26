import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { cliente, contacto, db, horario, panel, sitio, zona } from '@monitoring/db';
import type { App } from '../tipos.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

function idDe(request: FastifyRequest): number {
  return Number((request.params as { id: string }).id);
}

/** Actualización genérica: parsea, actualiza y responde 404 si no existe.
 *  (la tabla llega sin tipar: drizzle no acepta una unión de tablas en update/delete) */
async function actualizar(
  request: FastifyRequest,
  reply: FastifyReply,
  esquema: z.ZodTypeAny,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tabla: any,
) {
  const datos = esquema.safeParse(request.body);
  if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (await db.update(tabla).set(datos.data).where(eq(tabla.id, idDe(request))).returning()) as any[];
  if (!filas[0]) return reply.code(404).send({ error: 'No encontrado' });
  return filas[0];
}

/** Borrado físico solo para entidades sin historial; 409 si algo depende de ella. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function borrar(request: FastifyRequest, reply: FastifyReply, tabla: any) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas = (await db.delete(tabla).where(eq(tabla.id, idDe(request))).returning()) as any[];
    if (!filas[0]) return reply.code(404).send({ error: 'No encontrado' });
    return { eliminado: true };
  } catch {
    return reply.code(409).send({ error: 'Tiene registros asociados; no se puede eliminar' });
  }
}

const esquemaCliente = z.object({
  nombre: z.string().min(1),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  direccion: z.string().optional(),
  notas: z.string().optional(),
});

const esquemaSitio = z.object({
  clienteId: z.number().int(),
  nombre: z.string().min(1),
  direccion: z.string().optional(),
  notas: z.string().optional(),
});

const esquemaPanel = z.object({
  sitioId: z.number().int(),
  numeroCuenta: z.string().regex(/^[0-9A-Fa-f]{3,16}$/),
  tipo: z.enum(['hikvision', 'pima', 'ebm', 'otro']).default('otro'),
  modelo: z.string().optional(),
  supervisado: z.boolean().default(true),
  intervaloPruebaMin: z.number().int().positive().default(1440),
});

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
  telefono: z.string().min(1),
  orden: z.number().int().positive().default(1),
  palabraClave: z.string().optional(),
  notas: z.string().optional(),
});

export function registrarClientes(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/clientes', async () => db.select().from(cliente).orderBy(cliente.nombre));

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

  app.post('/paneles', async (request, reply) => {
    const datos = esquemaPanel.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.insert(panel).values(datos.data).returning();
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
  app.put('/clientes/:id', (req, res) => actualizar(req, res, esquemaCliente.partial().extend({ activo: z.boolean().optional() }), cliente));
  app.put('/sitios/:id', (req, res) => actualizar(req, res, esquemaSitio.omit({ clienteId: true }).partial(), sitio));
  app.delete('/sitios/:id', (req, res) => borrar(req, res, sitio));
  app.put('/paneles/:id', (req, res) =>
    actualizar(req, res, esquemaPanel.omit({ sitioId: true }).partial().extend({ activo: z.boolean().optional() }), panel),
  );
  app.put('/zonas/:id', (req, res) => actualizar(req, res, esquemaZona.omit({ panelId: true }).partial(), zona));
  app.delete('/zonas/:id', (req, res) => borrar(req, res, zona));
  app.put('/contactos/:id', (req, res) => actualizar(req, res, esquemaContacto.omit({ clienteId: true }).partial(), contacto));
  app.delete('/contactos/:id', (req, res) => borrar(req, res, contacto));

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
    actualizar(req, res, esquemaHorario.omit({ panelId: true }).partial().extend({ activo: z.boolean().optional() }), horario),
  );
  app.delete('/horarios/:id', (req, res) => borrar(req, res, horario));
}
