import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auditoria, db, plan } from '@monitoring/db';
import { FORMAS_PAGO, usdABs } from '@monitoring/shared';
import type { FastifyRequest } from 'fastify';
import type { App } from '../tipos.js';
import { anularCuota, anularPago, correrCobros, estadoDeCuenta, listaCobros, registrarPago, resumenCobros } from '../cobros/modelo.js';
import { tasaVigente } from '../tasa/bcv.js';

/**
 * Cobros para la central: planes, estado de cuenta por cliente, pagos.
 * Consultan todos los de la central; escriben administradores y
 * supervisores; anular es solo de administradores.
 */
export function registrarCobros(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  const idDe = (request: FastifyRequest) => Number((request.params as { id: string }).id);
  const puedeCobrar = (request: FastifyRequest) => request.user.rol === 'admin' || request.user.rol === 'supervisor';
  const auditar = (request: FastifyRequest, entidad: string, entidadId: number | null, accion: string, cambios?: unknown) =>
    db.insert(auditoria).values({ usuarioId: request.user.id, entidad, entidadId, accion, cambios: (cambios ?? null) as never });

  // ---- Planes ----
  const esquemaPlan = z.object({
    nombre: z.string().min(1).max(80),
    precioUsd: z.number().nonnegative().max(1_000_000),
    frecuenciaMeses: z.number().int().min(1).max(24).default(1),
    descripcion: z.string().max(500).nullable().optional(),
    activo: z.boolean().optional(),
  });

  app.get('/planes', async () => (await db.select().from(plan).orderBy(asc(plan.nombre))).map((p) => ({ ...p, precioUsd: Number(p.precioUsd) })));

  app.post('/planes', async (request, reply) => {
    if (!puedeCobrar(request)) return reply.code(403).send({ error: 'Solo administradores y supervisores' });
    const datos = esquemaPlan.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Datos del plan inválidos', detalle: datos.error.flatten() });
    const [fila] = await db
      .insert(plan)
      .values({ ...datos.data, precioUsd: datos.data.precioUsd.toFixed(2) })
      .onConflictDoNothing({ target: plan.nombre })
      .returning();
    if (!fila) return reply.code(409).send({ error: 'Ya existe un plan con ese nombre' });
    await auditar(request, 'plan', fila.id, 'crear', datos.data);
    return { ...fila, precioUsd: Number(fila.precioUsd) };
  });

  app.put('/planes/:id', async (request, reply) => {
    if (!puedeCobrar(request)) return reply.code(403).send({ error: 'Solo administradores y supervisores' });
    const datos = esquemaPlan.partial().safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Datos del plan inválidos' });
    const { precioUsd, ...resto } = datos.data;
    const [fila] = await db
      .update(plan)
      .set({ ...resto, ...(precioUsd !== undefined ? { precioUsd: precioUsd.toFixed(2) } : {}) })
      .where(eq(plan.id, idDe(request)))
      .returning();
    if (!fila) return reply.code(404).send({ error: 'Plan no encontrado' });
    await auditar(request, 'plan', fila.id, 'editar', datos.data);
    return { ...fila, precioUsd: Number(fila.precioUsd) };
  });

  // ---- Estado de cuenta ----
  app.get('/cobros/resumen', async () => resumenCobros());
  app.get('/cobros/clientes', async () => listaCobros());
  app.get('/cobros/clientes/:id', async (request, reply) => {
    const e = await estadoDeCuenta(idDe(request));
    if (!e) return reply.code(404).send({ error: 'Cliente no encontrado' });
    return { ...e, tasa: await tasaVigente() };
  });

  // ---- Pagos ----
  const esquemaPago = z
    .object({
      montoUsd: z.number().positive().max(1_000_000).optional(),
      montoBs: z.number().positive().max(1_000_000_000).optional(),
      tasa: z.number().positive().optional(),
      forma: z.enum(FORMAS_PAGO),
      referencia: z.string().max(80).nullable().optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      nota: z.string().max(500).nullable().optional(),
    })
    .refine((p) => p.montoUsd !== undefined || (p.montoBs !== undefined && p.tasa !== undefined), {
      message: 'Indique el monto en dólares, o el monto en bolívares con la tasa',
    });

  app.post('/cobros/clientes/:id/pagos', async (request, reply) => {
    if (!puedeCobrar(request)) return reply.code(403).send({ error: 'Solo administradores y supervisores' });
    const datos = esquemaPago.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues[0]?.message ?? 'Pago inválido' });
    const clienteId = idDe(request);
    if (!(await estadoDeCuenta(clienteId))) return reply.code(404).send({ error: 'Cliente no encontrado' });
    const d = datos.data;
    // Pagó en bolívares: se lleva a dólares con la tasa del día del pago (la que indique quien registra)
    const montoUsd = d.montoUsd ?? Math.round((d.montoBs! / d.tasa!) * 100) / 100;
    const montoBs = d.montoBs ?? (d.tasa ? usdABs(montoUsd, d.tasa) : null);
    const r = await registrarPago({ clienteId, montoUsd, montoBs, tasa: d.tasa ?? null, forma: d.forma, referencia: d.referencia, fecha: d.fecha, nota: d.nota, registradoPor: request.user.id });
    await auditar(request, 'pago', r.pago.id, 'crear', { clienteId, montoUsd, forma: d.forma, referencia: d.referencia });
    return { ...r, pago: { ...r.pago, montoUsd: Number(r.pago.montoUsd) } };
  });

  app.post('/cobros/pagos/:id/anular', async (request, reply) => {
    if (request.user.rol !== 'admin') return reply.code(403).send({ error: 'Solo administradores' });
    const ok = await anularPago(idDe(request));
    if (!ok) return reply.code(404).send({ error: 'Pago no encontrado o ya anulado' });
    await auditar(request, 'pago', idDe(request), 'anular');
    return { ok: true };
  });

  app.post('/cobros/cuotas/:id/anular', async (request, reply) => {
    if (request.user.rol !== 'admin') return reply.code(403).send({ error: 'Solo administradores' });
    const r = await anularCuota(idDe(request));
    if (r === 'no-existe') return reply.code(404).send({ error: 'Cuota no encontrada' });
    if (r === 'con-pagos') return reply.code(409).send({ error: 'La cuota tiene pagos aplicados: anule primero el pago' });
    await auditar(request, 'cuota', idDe(request), 'anular');
    return { ok: true };
  });

  /** Fuerza la corrida (generar cuotas que tocan y avisar), sin esperar a la automática. */
  app.post('/cobros/generar', async (request, reply) => {
    if (!puedeCobrar(request)) return reply.code(403).send({ error: 'Solo administradores y supervisores' });
    return correrCobros(request.log);
  });
}
