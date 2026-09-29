import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, guardia, pautaTurno, turno, usuario } from '@monitoring/db';
import { deGuardia, pautaVigente } from '@monitoring/shared';
import { enZona } from '@monitoring/engine';
import type { FastifyRequest } from 'fastify';
import type { App } from '../tipos.js';

/**
 * Turnos de la central: la pauta semanal (con varias posibles, para
 * rotaciones) y las guardias por fecha, que son la excepción y mandan.
 * De acá sale a quién se le avisa al teléfono cuando entra una emergencia.
 */

const hora = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const dias = z.string().regex(/^[LMXJVSD-]{7}$/);

/** Los usuarios de guardia ahora mismo, en hora de la central. */
export async function usuariosDeGuardia(ahora: Date = new Date()): Promise<number[]> {
  const pautas = await db.select().from(pautaTurno);
  const vigente = pautaVigente(pautas);
  const tramos = vigente
    ? (await db.select().from(turno).where(eq(turno.pautaId, vigente.id))).filter((t) => t.activo)
    : [];
  const guardias = await db.select().from(guardia);
  return deGuardia(
    tramos.map((t) => ({ usuarioId: t.usuarioId, dias: t.dias, desde: t.desde, hasta: t.hasta })),
    guardias.map((g) => ({ usuarioId: g.usuarioId, fecha: g.fecha, desde: g.desde, hasta: g.hasta })),
    enZona(null, ahora),
  );
}

export function registrarTurnos(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  const idDe = (request: FastifyRequest) => Number((request.params as { id: string }).id);
  const puedeEditar = (request: FastifyRequest) => request.user.rol === 'admin' || request.user.rol === 'supervisor';
  const soloJefes = (request: FastifyRequest, reply: { code: (n: number) => { send: (o: object) => unknown } }) =>
    puedeEditar(request) ? null : reply.code(403).send({ error: 'Solo administradores y supervisores' });

  /** Todo lo que necesita la pantalla de turnos, en una sola consulta. */
  app.get('/turnos', async () => {
    const pautas = await db.select().from(pautaTurno).orderBy(asc(pautaTurno.nombre));
    const tramos = await db
      .select({ id: turno.id, pautaId: turno.pautaId, usuarioId: turno.usuarioId, usuarioNombre: usuario.nombre, dias: turno.dias, desde: turno.desde, hasta: turno.hasta, activo: turno.activo })
      .from(turno)
      .innerJoin(usuario, eq(turno.usuarioId, usuario.id))
      .orderBy(asc(turno.desde));
    const guardias = await db
      .select({ id: guardia.id, usuarioId: guardia.usuarioId, usuarioNombre: usuario.nombre, fecha: guardia.fecha, desde: guardia.desde, hasta: guardia.hasta, nota: guardia.nota })
      .from(guardia)
      .innerJoin(usuario, eq(guardia.usuarioId, usuario.id))
      .orderBy(asc(guardia.fecha));
    return { pautas, tramos, guardias, vigente: pautaVigente(pautas)?.id ?? null, deGuardiaAhora: await usuariosDeGuardia() };
  });

  // ---- Pautas ----
  app.post('/turnos/pautas', async (request, reply) => {
    const negado = soloJefes(request, reply);
    if (negado) return negado;
    const datos = z.object({ nombre: z.string().min(1).max(60) }).safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Nombre requerido' });
    const [fila] = await db.insert(pautaTurno).values(datos.data).onConflictDoNothing({ target: pautaTurno.nombre }).returning();
    if (!fila) return reply.code(409).send({ error: 'Ya existe una pauta con ese nombre' });
    return fila;
  });

  /** Activar una pauta apaga las demás: siempre rige una sola. */
  app.post('/turnos/pautas/:id/activar', async (request, reply) => {
    const negado = soloJefes(request, reply);
    if (negado) return negado;
    const id = idDe(request);
    await db.update(pautaTurno).set({ activa: false });
    const [fila] = await db.update(pautaTurno).set({ activa: true }).where(eq(pautaTurno.id, id)).returning();
    if (!fila) return reply.code(404).send({ error: 'Pauta no encontrada' });
    return fila;
  });

  app.delete('/turnos/pautas/:id', async (request, reply) => {
    const negado = soloJefes(request, reply);
    if (negado) return negado;
    const id = idDe(request);
    await db.delete(turno).where(eq(turno.pautaId, id));
    await db.delete(pautaTurno).where(eq(pautaTurno.id, id));
    return { eliminado: true };
  });

  // ---- Tramos de la pauta ----
  const esquemaTramo = z.object({ pautaId: z.number().int(), usuarioId: z.number().int(), dias, desde: hora, hasta: hora });

  app.post('/turnos/tramos', async (request, reply) => {
    const negado = soloJefes(request, reply);
    if (negado) return negado;
    const datos = esquemaTramo.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Datos del turno inválidos', detalle: datos.error.flatten() });
    const [fila] = await db.insert(turno).values(datos.data).returning();
    return fila;
  });

  app.delete('/turnos/tramos/:id', async (request, reply) => {
    const negado = soloJefes(request, reply);
    if (negado) return negado;
    await db.delete(turno).where(eq(turno.id, idDe(request)));
    return { eliminado: true };
  });

  // ---- Guardias por fecha (la excepción) ----
  const esquemaGuardia = z.object({
    usuarioId: z.number().int(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    desde: hora,
    hasta: hora,
    nota: z.string().max(200).nullable().optional(),
  });

  app.post('/turnos/guardias', async (request, reply) => {
    const negado = soloJefes(request, reply);
    if (negado) return negado;
    const datos = esquemaGuardia.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Datos de la guardia inválidos' });
    const [fila] = await db.insert(guardia).values(datos.data).returning();
    return fila;
  });

  app.delete('/turnos/guardias/:id', async (request, reply) => {
    const negado = soloJefes(request, reply);
    if (negado) return negado;
    await db.delete(guardia).where(eq(guardia.id, idDe(request)));
    return { eliminado: true };
  });
}
