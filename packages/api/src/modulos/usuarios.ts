import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { acceso, cliente, db, hashearClave, panel, sitio, usuario } from '@monitoring/db';
import type { App } from '../tipos.js';

const esquemaAlta = z
  .object({
    email: z.string().email(),
    nombre: z.string().min(1),
    clave: z.string().min(6),
    rol: z.enum(['admin', 'operador', 'cliente']).default('operador'),
    /** Para rol 'cliente': acceso inicial a todo este cliente */
    clienteId: z.number().int().optional(),
  })
  .refine((d) => d.rol !== 'cliente' || d.clienteId != null, {
    message: 'Un usuario de app necesita al menos un cliente',
  });

const esquemaEdicion = z.object({
  nombre: z.string().min(1).optional(),
  rol: z.enum(['admin', 'operador']).optional(),
  activo: z.boolean().optional(),
  /** Si viene, restablece la clave del usuario */
  clave: z.string().min(6).optional(),
});

const esquemaAcceso = z.object({
  usuarioId: z.number().int(),
  clienteId: z.number().int(),
  sitioId: z.number().int().optional(),
  panelId: z.number().int().optional(),
});

const COLUMNAS_PUBLICAS = {
  id: usuario.id,
  email: usuario.email,
  nombre: usuario.nombre,
  rol: usuario.rol,
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
    if (clienteId) {
      // Usuarios con algún acceso sobre este cliente, con el alcance de cada acceso
      return db
        .selectDistinctOn([usuario.id], COLUMNAS_PUBLICAS)
        .from(usuario)
        .innerJoin(acceso, and(eq(acceso.usuarioId, usuario.id), eq(acceso.clienteId, Number(clienteId))));
    }
    return db.select(COLUMNAS_PUBLICAS).from(usuario).orderBy(usuario.nombre);
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
          hashClave: hashearClave(datos.data.clave),
        })
        .returning(COLUMNAS_PUBLICAS);
      if (datos.data.rol === 'cliente' && datos.data.clienteId) {
        await db.insert(acceso).values({ usuarioId: fila!.id, clienteId: datos.data.clienteId });
      }
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
      return reply.code(400).send({ error: 'No puede desactivar o degradar su propio usuario' });
    }
    // Una cuenta de la app de clientes jamás pasa a personal de la central.
    if (resto.rol) {
      const [actual] = await db.select({ rol: usuario.rol }).from(usuario).where(eq(usuario.id, id)).limit(1);
      if (actual?.rol === 'cliente') {
        return reply.code(400).send({ error: 'Un usuario de la app no puede cambiar de rol' });
      }
    }
    const [fila] = await db
      .update(usuario)
      .set({ ...resto, ...(clave ? { hashClave: hashearClave(clave) } : {}) })
      .where(eq(usuario.id, id))
      .returning(COLUMNAS_PUBLICAS);
    if (!fila) return reply.code(404).send({ error: 'Usuario no encontrado' });
    return fila;
  });

  /**
   * Impersonar a un usuario de la app: devuelve un token de 1 hora con su
   * identidad para que el administrador vea exactamente lo que ve el cliente.
   * Solo sobre cuentas de rol 'cliente' activas; queda registrado en el log.
   */
  app.post('/usuarios/:id/impersonar', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [objetivo] = await db.select().from(usuario).where(eq(usuario.id, id)).limit(1);
    if (!objetivo) return reply.code(404).send({ error: 'Usuario no encontrado' });
    if (objetivo.rol !== 'cliente' || !objetivo.activo) {
      return reply.code(400).send({ error: 'Solo se puede impersonar a usuarios de la app activos' });
    }
    request.log.warn({ admin: request.user.email, objetivo: objetivo.email }, 'Impersonación de usuario de app');
    const token = app.jwt.sign({ id: objetivo.id, email: objetivo.email, rol: 'cliente' }, { expiresIn: '1h' });
    return {
      token,
      usuario: { id: objetivo.id, email: objetivo.email, nombre: objetivo.nombre, rol: objetivo.rol },
    };
  });

  // ---- Accesos (permisos de la app sobre clientes/sitios/paneles) ----

  app.get('/usuarios/:id/accesos', async (request) => {
    const id = Number((request.params as { id: string }).id);
    return db
      .select({
        id: acceso.id,
        clienteId: acceso.clienteId,
        clienteNombre: cliente.nombre,
        sitioId: acceso.sitioId,
        sitioNombre: sitio.nombre,
        panelId: acceso.panelId,
        panelCuenta: panel.numeroCuenta,
      })
      .from(acceso)
      .innerJoin(cliente, eq(acceso.clienteId, cliente.id))
      .leftJoin(sitio, eq(acceso.sitioId, sitio.id))
      .leftJoin(panel, eq(acceso.panelId, panel.id))
      .where(eq(acceso.usuarioId, id));
  });

  app.post('/accesos', async (request, reply) => {
    const datos = esquemaAcceso.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const { usuarioId, clienteId, sitioId, panelId } = datos.data;

    // Integridad del alcance: el sitio/panel tiene que colgar del cliente indicado
    if (sitioId) {
      const [fila] = await db.select({ id: sitio.id }).from(sitio).where(and(eq(sitio.id, sitioId), eq(sitio.clienteId, clienteId))).limit(1);
      if (!fila) return reply.code(400).send({ error: 'El sitio no pertenece a ese cliente' });
    }
    if (panelId) {
      const [fila] = await db
        .select({ id: panel.id })
        .from(panel)
        .innerJoin(sitio, eq(panel.sitioId, sitio.id))
        .where(and(eq(panel.id, panelId), eq(sitio.clienteId, clienteId)))
        .limit(1);
      if (!fila) return reply.code(400).send({ error: 'El panel no pertenece a ese cliente' });
    }

    const [fila] = await db.insert(acceso).values({ usuarioId, clienteId, sitioId, panelId }).returning();
    return reply.code(201).send(fila);
  });

  app.delete('/accesos/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db.delete(acceso).where(eq(acceso.id, id)).returning();
    if (!fila) return reply.code(404).send({ error: 'Acceso no encontrado' });
    return { eliminado: true };
  });
}
