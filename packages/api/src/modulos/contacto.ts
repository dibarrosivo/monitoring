import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { contactoWeb, db } from '@monitoring/db';
import type { App } from '../tipos.js';

/**
 * Contacto desde la landing pública. Sin sesión: por eso lleva honeypot (un
 * campo que los humanos no ven; si viene lleno se responde ok sin guardar)
 * y un tope por IP. El pedido SIEMPRE queda en la base; el personal lo ve
 * en la consola y lo marca atendido.
 */
const esquema = z.object({
  nombre: z.string().trim().min(2).max(120),
  telefono: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(254).optional(),
  mensaje: z.string().trim().max(2000).optional(),
  motivo: z.enum(['monitoreo', 'plan', 'compatibilidad', 'instalador', 'contacto']).default('contacto'),
  sitioWeb: z.string().max(200).optional(),
});

const TOPE_POR_IP = 5;
const VENTANA_MS = 60_000;
const golpes = new Map<string, number[]>();

function pasaTope(ip: string, ahora = Date.now()): boolean {
  const lista = (golpes.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length >= TOPE_POR_IP) return false;
  lista.push(ahora);
  golpes.set(ip, lista);
  return true;
}

/** Ruta pública: se registra fuera del hook de autenticación. */
export function registrarContactoPublico(app: App) {
  app.post('/contacto', async (request, reply) => {
    const datos = esquema.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Nombre y teléfono son obligatorios' });
    if (datos.data.sitioWeb) return { ok: true }; // bot: se le dice que sí y no se guarda nada
    const ip = request.ip ?? '';
    if (!pasaTope(ip)) return reply.code(429).send({ error: 'Demasiados envíos; intente en un minuto' });
    const { sitioWeb: _ignorado, ...resto } = datos.data;
    const [fila] = await db
      .insert(contactoWeb)
      .values({ ...resto, origenIp: ip.slice(0, 64) })
      .returning({ id: contactoWeb.id });
    request.log.warn({ contactoId: fila?.id, motivo: resto.motivo, nombre: resto.nombre }, 'Pedido de contacto desde la web');
    return { ok: true };
  });
}

/** Lo que ve el personal: la lista y marcar atendido. */
export function registrarContactos(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);
  app.get('/contactos-web', async () => db.select().from(contactoWeb).orderBy(desc(contactoWeb.id)).limit(200));
  app.post('/contactos-web/:id/atendido', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db.update(contactoWeb).set({ atendidoEn: new Date() }).where(eq(contactoWeb.id, id)).returning();
    if (!fila) return reply.code(404).send({ error: 'No existe' });
    return fila;
  });
}
