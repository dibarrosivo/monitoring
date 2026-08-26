import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, hashearClave, usuario } from '@monitoring/db';
import type { App } from '../tipos.js';

const esquemaAlta = z
  .object({
    email: z.string().email(),
    nombre: z.string().min(1),
    clave: z.string().min(6),
    rol: z.enum(['admin', 'operador', 'cliente']).default('operador'),
    /** Obligatorio para rol 'cliente': el cliente al que queda acotado */
    clienteId: z.number().int().optional(),
  })
  .refine((d) => d.rol !== 'cliente' || d.clienteId != null, {
    message: 'Un usuario de app necesita clienteId',
  });

const esquemaEdicion = z.object({
  nombre: z.string().min(1).optional(),
  rol: z.enum(['admin', 'operador']).optional(),
  activo: z.boolean().optional(),
  /** Si viene, restablece la clave del usuario */
  clave: z.string().min(6).optional(),
});

const COLUMNAS_PUBLICAS = {
  id: usuario.id,
  email: usuario.email,
  nombre: usuario.nombre,
  rol: usuario.rol,
  clienteId: usuario.clienteId,
  activo: usuario.activo,
  creadoEn: usuario.creadoEn,
};

export function registrarUsuarios(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);
  app.addHook('onRequest', async (request, reply) => {
    if (request.user.rol !== 'admin') return reply.code(403).send({ error: 'Solo administradores' });
  });

  app.get('/usuarios', async (request) => {
    const { clienteId } = request.query as { clienteId?: string };
    const base = db.select(COLUMNAS_PUBLICAS).from(usuario);
    const filtrada = clienteId ? base.where(eq(usuario.clienteId, Number(clienteId))) : base;
    return filtrada.orderBy(usuario.nombre);
  });

  app.post('/usuarios', async (request, reply) => {
    const datos = esquemaAlta.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    try {
      const [fila] = await db
        .insert(usuario)
        .values({
          email: datos.data.email,
          nombre: datos.data.nombre,
          rol: datos.data.rol,
          clienteId: datos.data.rol === 'cliente' ? datos.data.clienteId : null,
          hashClave: hashearClave(datos.data.clave),
        })
        .returning(COLUMNAS_PUBLICAS);
      return reply.code(201).send(fila);
    } catch {
      return reply.code(409).send({ error: 'Ya existe un usuario con ese email' });
    }
  });

  app.put('/usuarios/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaEdicion.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const { clave, ...resto } = datos.data;
    // Un admin no puede desactivarse ni degradarse a sí mismo (evita quedarse afuera).
    if (id === request.user.id && (resto.activo === false || resto.rol === 'operador')) {
      return reply.code(400).send({ error: 'No podés desactivar o degradar tu propio usuario' });
    }
    const [fila] = await db
      .update(usuario)
      .set({ ...resto, ...(clave ? { hashClave: hashearClave(clave) } : {}) })
      .where(eq(usuario.id, id))
      .returning(COLUMNAS_PUBLICAS);
    if (!fila) return reply.code(404).send({ error: 'Usuario no encontrado' });
    return fila;
  });
}
