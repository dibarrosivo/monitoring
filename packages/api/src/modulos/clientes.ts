import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { cliente, contacto, db, panel, sitio, zona } from '@monitoring/db';
import type { App } from '../tipos.js';

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
}
