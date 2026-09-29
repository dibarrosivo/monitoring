import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { acceso, cliente, cuota, db, dispositivoPush, pago, pagoCuota, panel, plan, sitio, usuario } from '@monitoring/db';
import { conceptoCuota, formatearBs, formatearUsd, periodoDesde, repartirPago, usdABs, type EstadoCuota, type FormaPago } from '@monitoring/shared';
import { enviarPush, pushDisponible } from '../push/fcm.js';
import { hoyCentral, tasaVigente } from '../tasa/bcv.js';

/**
 * Cobros: generación de cuotas, pagos y estado de cuenta. Todo en dólares;
 * la conversión a bolívares es al momento de mostrar, con la tasa vigente.
 * La mora solo se marca y se avisa: nunca toca el monitoreo.
 */

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

const n = (v: string | number | null | undefined): number => Number(v ?? 0);
const dinero = (v: number): string => v.toFixed(2);

/** Días entre el inicio del período y el vencimiento de su cuota. */
const DIAS_PARA_PAGAR = Number(process.env.COBROS_DIAS_PARA_PAGAR ?? 5);

// ---- Generación de cuotas ----

/**
 * Para cada dispositivo activo con plan (o monto propio) cuyo próximo
 * período ya empezó, crea la cuota y corre el próximo vencimiento. Si el
 * servidor estuvo apagado varios períodos, los genera todos (con tope).
 */
export async function generarCuotas(hoy = hoyCentral()): Promise<number> {
  const filas = await db
    .select({
      panelId: panel.id,
      clienteId: sitio.clienteId,
      montoAbono: panel.montoAbono,
      frecuenciaPanel: panel.frecuenciaMeses,
      proximoVencimiento: panel.proximoVencimiento,
      planPrecio: plan.precioUsd,
      planMeses: plan.frecuenciaMeses,
    })
    .from(panel)
    .innerJoin(sitio, eq(panel.sitioId, sitio.id))
    .innerJoin(cliente, eq(sitio.clienteId, cliente.id))
    .leftJoin(plan, eq(panel.planId, plan.id))
    .where(and(eq(panel.activo, true), eq(panel.exonerado, false), eq(cliente.exonerado, false), isNotNull(panel.proximoVencimiento), lte(panel.proximoVencimiento, hoy)));

  let creadas = 0;
  for (const f of filas) {
    const precio = f.montoAbono !== null ? n(f.montoAbono) : f.planPrecio !== null ? n(f.planPrecio) : null;
    if (precio === null || precio <= 0) continue;
    const meses = f.planMeses ?? f.frecuenciaPanel ?? 1;
    let inicio = f.proximoVencimiento!;
    for (let vueltas = 0; inicio <= hoy && vueltas < 24; vueltas++) {
      const periodo = periodoDesde(inicio, meses);
      const [creada] = await db
        .insert(cuota)
        .values({
          clienteId: f.clienteId,
          panelId: f.panelId,
          periodoDesde: periodo.desde,
          periodoHasta: periodo.hasta,
          venceEn: sumarDiasIso(periodo.desde, DIAS_PARA_PAGAR),
          montoUsd: dinero(precio),
          concepto: conceptoCuota(periodo.desde, periodo.hasta, meses),
        })
        .onConflictDoNothing({ target: [cuota.panelId, cuota.periodoDesde] })
        .returning({ id: cuota.id });
      if (creada) creadas++;
      inicio = periodo.siguiente;
    }
    await db.update(panel).set({ proximoVencimiento: inicio }).where(eq(panel.id, f.panelId));
    await aplicarSaldoAFavor(f.clienteId);
  }
  return creadas;
}

function sumarDiasIso(fecha: string, dias: number): string {
  const f = new Date(`${fecha}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

// ---- Pagos ----

async function cuotasAbiertas(clienteId: number) {
  return db
    .select({ id: cuota.id, montoUsd: cuota.montoUsd, pagadoUsd: cuota.pagadoUsd })
    .from(cuota)
    .where(and(eq(cuota.clienteId, clienteId), eq(cuota.estado, 'pendiente')))
    .orderBy(asc(cuota.venceEn), asc(cuota.id));
}

/** Lo pagado que todavía no cubrió ninguna cuota. */
export async function saldoAFavor(clienteId: number): Promise<number> {
  const [pagos] = await db
    .select({ total: sql<string>`coalesce(sum(${pago.montoUsd}), 0)` })
    .from(pago)
    .where(and(eq(pago.clienteId, clienteId), eq(pago.estado, 'confirmado')));
  const [aplicado] = await db
    .select({ total: sql<string>`coalesce(sum(${pagoCuota.montoUsd}), 0)` })
    .from(pagoCuota)
    .innerJoin(pago, eq(pagoCuota.pagoId, pago.id))
    .where(and(eq(pago.clienteId, clienteId), eq(pago.estado, 'confirmado')));
  return Math.round((n(pagos?.total) - n(aplicado?.total)) * 100) / 100;
}

/** Aplica un monto de un pago a las cuotas abiertas del cliente, la más vieja primero. */
async function aplicarAPagos(clienteId: number, pagoId: number, montoUsd: number): Promise<number> {
  const abiertas = (await cuotasAbiertas(clienteId)).map((c) => ({ id: c.id, montoUsd: n(c.montoUsd), pagadoUsd: n(c.pagadoUsd) }));
  const { aplicado, sobrante } = repartirPago(montoUsd, abiertas);
  for (const a of aplicado) {
    await db.insert(pagoCuota).values({ pagoId, cuotaId: a.cuotaId, montoUsd: dinero(a.montoUsd) });
    const c = abiertas.find((x) => x.id === a.cuotaId)!;
    const pagado = Math.round((c.pagadoUsd + a.montoUsd) * 100) / 100;
    await db
      .update(cuota)
      .set({ pagadoUsd: dinero(pagado), estado: pagado >= c.montoUsd ? 'pagada' : 'pendiente' })
      .where(eq(cuota.id, a.cuotaId));
  }
  return sobrante;
}

/** Si el cliente tiene saldo a favor (pagó de más o por adelantado), lo usa en las cuotas nuevas. */
export async function aplicarSaldoAFavor(clienteId: number): Promise<void> {
  let disponible = await saldoAFavor(clienteId);
  if (disponible <= 0) return;
  // Se reparte desde los pagos con resto, el más viejo primero
  const pagos = await db
    .select({ id: pago.id, montoUsd: pago.montoUsd, aplicado: sql<string>`coalesce((select sum(${pagoCuota.montoUsd}) from ${pagoCuota} where ${pagoCuota.pagoId} = ${pago.id}), 0)` })
    .from(pago)
    .where(and(eq(pago.clienteId, clienteId), eq(pago.estado, 'confirmado')))
    .orderBy(asc(pago.fecha), asc(pago.id));
  for (const p of pagos) {
    if (disponible <= 0) break;
    const resto = Math.round((n(p.montoUsd) - n(p.aplicado)) * 100) / 100;
    if (resto <= 0) continue;
    const sobrante = await aplicarAPagos(clienteId, p.id, resto);
    disponible -= resto - sobrante;
    if (sobrante > 0) break; // no quedan cuotas abiertas
  }
}

export interface DatosPago {
  clienteId: number;
  montoUsd: number;
  montoBs?: number | null;
  tasa?: number | null;
  forma: FormaPago;
  referencia?: string | null;
  fecha: string;
  nota?: string | null;
  registradoPor: number | null;
}

/** Registra un pago confirmado y lo aplica. Devuelve el pago, lo aplicado y el saldo a favor que queda. */
export async function registrarPago(datos: DatosPago) {
  const [fila] = await db
    .insert(pago)
    .values({
      clienteId: datos.clienteId,
      montoUsd: dinero(datos.montoUsd),
      montoBs: datos.montoBs != null ? dinero(datos.montoBs) : null,
      tasa: datos.tasa != null ? datos.tasa.toFixed(4) : null,
      forma: datos.forma,
      referencia: datos.referencia ?? null,
      fecha: datos.fecha,
      nota: datos.nota ?? null,
      estado: 'confirmado',
      registradoPor: datos.registradoPor,
    })
    .returning();
  const sobrante = await aplicarAPagos(datos.clienteId, fila!.id, datos.montoUsd);
  return { pago: fila!, aplicadoUsd: Math.round((datos.montoUsd - sobrante) * 100) / 100, saldoAFavorUsd: await saldoAFavor(datos.clienteId) };
}

/** Anula un pago: deshace lo que cubrió y las cuotas vuelven a pendientes. */
export async function anularPago(pagoId: number): Promise<boolean> {
  const [p] = await db.select().from(pago).where(eq(pago.id, pagoId)).limit(1);
  if (!p || p.estado === 'anulado') return false;
  const partes = await db.select().from(pagoCuota).where(eq(pagoCuota.pagoId, pagoId));
  for (const parte of partes) {
    const [c] = await db.select().from(cuota).where(eq(cuota.id, parte.cuotaId)).limit(1);
    if (!c) continue;
    const pagado = Math.max(0, Math.round((n(c.pagadoUsd) - n(parte.montoUsd)) * 100) / 100);
    await db
      .update(cuota)
      .set({ pagadoUsd: dinero(pagado), estado: c.estado === 'anulada' ? 'anulada' : pagado >= n(c.montoUsd) ? 'pagada' : 'pendiente' })
      .where(eq(cuota.id, c.id));
  }
  await db.delete(pagoCuota).where(eq(pagoCuota.pagoId, pagoId));
  await db.update(pago).set({ estado: 'anulado' }).where(eq(pago.id, pagoId));
  return true;
}

/** Anula una cuota que no tenga pagos aplicados (un cargo por error). */
export async function anularCuota(cuotaId: number): Promise<'anulada' | 'no-existe' | 'con-pagos'> {
  const [c] = await db.select().from(cuota).where(eq(cuota.id, cuotaId)).limit(1);
  if (!c) return 'no-existe';
  if (n(c.pagadoUsd) > 0) return 'con-pagos';
  await db.update(cuota).set({ estado: 'anulada' }).where(eq(cuota.id, cuotaId));
  return 'anulada';
}

// ---- Consultas ----

export interface CuotaVista {
  id: number;
  panelId: number;
  numeroCuenta: string;
  prefijo: string | null;
  concepto: string;
  periodoDesde: string;
  periodoHasta: string;
  venceEn: string;
  montoUsd: number;
  pagadoUsd: number;
  estado: EstadoCuota;
}

async function cuotasDe(clienteId: number, limite: number): Promise<CuotaVista[]> {
  const filas = await db
    .select({
      id: cuota.id,
      panelId: cuota.panelId,
      numeroCuenta: panel.numeroCuenta,
      prefijo: panel.prefijo,
      concepto: cuota.concepto,
      periodoDesde: cuota.periodoDesde,
      periodoHasta: cuota.periodoHasta,
      venceEn: cuota.venceEn,
      montoUsd: cuota.montoUsd,
      pagadoUsd: cuota.pagadoUsd,
      estado: cuota.estado,
    })
    .from(cuota)
    .innerJoin(panel, eq(cuota.panelId, panel.id))
    .where(eq(cuota.clienteId, clienteId))
    .orderBy(desc(cuota.periodoDesde), desc(cuota.id))
    .limit(limite);
  return filas.map((f) => ({ ...f, montoUsd: n(f.montoUsd), pagadoUsd: n(f.pagadoUsd), estado: f.estado as EstadoCuota }));
}

/** Estado de cuenta de un cliente: dispositivos con su plan, cuotas, pagos y saldos. */
export async function estadoDeCuenta(clienteId: number) {
  const [c] = await db.select({ id: cliente.id, nombre: cliente.nombre, exonerado: cliente.exonerado }).from(cliente).where(eq(cliente.id, clienteId)).limit(1);
  if (!c) return null;
  const dispositivos = await db
    .select({
      panelId: panel.id,
      numeroCuenta: panel.numeroCuenta,
      prefijo: panel.prefijo,
      sitioNombre: sitio.nombre,
      activo: panel.activo,
      exonerado: panel.exonerado,
      planId: panel.planId,
      planNombre: plan.nombre,
      planPrecioUsd: plan.precioUsd,
      planMeses: plan.frecuenciaMeses,
      montoAbono: panel.montoAbono,
      frecuenciaMeses: panel.frecuenciaMeses,
      proximoVencimiento: panel.proximoVencimiento,
    })
    .from(panel)
    .innerJoin(sitio, eq(panel.sitioId, sitio.id))
    .leftJoin(plan, eq(panel.planId, plan.id))
    .where(eq(sitio.clienteId, clienteId))
    .orderBy(asc(panel.numeroCuenta));
  const cuotas = await cuotasDe(clienteId, 60);
  const pagos = await db
    .select({
      id: pago.id,
      montoUsd: pago.montoUsd,
      montoBs: pago.montoBs,
      tasa: pago.tasa,
      forma: pago.forma,
      referencia: pago.referencia,
      fecha: pago.fecha,
      nota: pago.nota,
      estado: pago.estado,
      registradoPorNombre: usuario.nombre,
      creadoEn: pago.creadoEn,
    })
    .from(pago)
    .leftJoin(usuario, eq(pago.registradoPor, usuario.id))
    .where(eq(pago.clienteId, clienteId))
    .orderBy(desc(pago.fecha), desc(pago.id))
    .limit(60);
  const hoy = hoyCentral();
  const pendientes = cuotas.filter((q) => q.estado === 'pendiente');
  const pendienteUsd = Math.round(pendientes.reduce((s, q) => s + q.montoUsd - q.pagadoUsd, 0) * 100) / 100;
  const vencidoUsd = Math.round(pendientes.filter((q) => q.venceEn < hoy).reduce((s, q) => s + q.montoUsd - q.pagadoUsd, 0) * 100) / 100;
  return {
    cliente: c,
    dispositivos: dispositivos.map((d) => ({
      ...d,
      precioUsd: d.montoAbono !== null ? n(d.montoAbono) : d.planPrecioUsd !== null ? n(d.planPrecioUsd) : null,
      meses: d.planMeses ?? d.frecuenciaMeses,
      planPrecioUsd: d.planPrecioUsd !== null ? n(d.planPrecioUsd) : null,
      montoAbono: d.montoAbono !== null ? n(d.montoAbono) : null,
    })),
    cuotas,
    pagos: pagos.map((p) => ({ ...p, montoUsd: n(p.montoUsd), montoBs: p.montoBs !== null ? n(p.montoBs) : null, tasa: p.tasa !== null ? n(p.tasa) : null })),
    pendienteUsd,
    vencidoUsd,
    saldoAFavorUsd: await saldoAFavor(clienteId),
  };
}

/** Una fila por cliente con lo que importa para cobrar: cuánto debe, cuánto está vencido, último pago. */
export async function listaCobros() {
  const hoy = hoyCentral();
  const filas = await db
    .select({
      clienteId: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      exonerado: cliente.exonerado,
      dispositivos: sql<number>`(select count(*) from ${panel} p join ${sitio} s on p.id_sitio = s.id where s.id_cliente = ${cliente.id} and p.activo and (p.id_plan is not null or p.monto_abono is not null))`.mapWith(Number),
      pendienteUsd: sql<string>`coalesce(sum(case when ${cuota.estado} = 'pendiente' then ${cuota.montoUsd} - ${cuota.pagadoUsd} else 0 end), 0)`,
      vencidoUsd: sql<string>`coalesce(sum(case when ${cuota.estado} = 'pendiente' and ${cuota.venceEn} < ${hoy} then ${cuota.montoUsd} - ${cuota.pagadoUsd} else 0 end), 0)`,
      cuotasVencidas: sql<number>`count(*) filter (where ${cuota.estado} = 'pendiente' and ${cuota.venceEn} < ${hoy})`.mapWith(Number),
      proximaVence: sql<string | null>`min(${cuota.venceEn}) filter (where ${cuota.estado} = 'pendiente')`,
      ultimoPago: sql<string | null>`(select max(fecha) from ${pago} where ${pago.clienteId} = ${cliente.id} and ${pago.estado} = 'confirmado')`,
    })
    .from(cliente)
    .leftJoin(cuota, eq(cuota.clienteId, cliente.id))
    .groupBy(cliente.id)
    .orderBy(cliente.nombre);
  return filas
    .map((f) => ({ ...f, pendienteUsd: n(f.pendienteUsd), vencidoUsd: n(f.vencidoUsd) }))
    .filter((f) => f.dispositivos > 0 || f.pendienteUsd > 0 || f.ultimoPago !== null || f.exonerado);
}

/** Números del mes para la cabecera de Cobros. */
export async function resumenCobros() {
  const hoy = hoyCentral();
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const [c] = await db
    .select({
      morosos: sql<number>`count(distinct ${cuota.clienteId}) filter (where ${cuota.estado} = 'pendiente' and ${cuota.venceEn} < ${hoy})`.mapWith(Number),
      vencidoUsd: sql<string>`coalesce(sum(case when ${cuota.estado} = 'pendiente' and ${cuota.venceEn} < ${hoy} then ${cuota.montoUsd} - ${cuota.pagadoUsd} else 0 end), 0)`,
      pendienteUsd: sql<string>`coalesce(sum(case when ${cuota.estado} = 'pendiente' then ${cuota.montoUsd} - ${cuota.pagadoUsd} else 0 end), 0)`,
      porVencer: sql<number>`count(*) filter (where ${cuota.estado} = 'pendiente' and ${cuota.venceEn} >= ${hoy} and ${cuota.venceEn} <= (${hoy}::date + 7))`.mapWith(Number),
    })
    .from(cuota);
  const [p] = await db
    .select({ cobradoMesUsd: sql<string>`coalesce(sum(${pago.montoUsd}), 0)` })
    .from(pago)
    .where(and(eq(pago.estado, 'confirmado'), sql`${pago.fecha} >= ${inicioMes}`));
  const [f] = await db
    .select({ facturadoMesUsd: sql<string>`coalesce(sum(${cuota.montoUsd}), 0)` })
    .from(cuota)
    .where(and(sql`${cuota.periodoDesde} >= ${inicioMes}`, sql`${cuota.periodoDesde} <= ${hoy}`, sql`${cuota.estado} <> 'anulada'`));
  return {
    morosos: c?.morosos ?? 0,
    vencidoUsd: n(c?.vencidoUsd),
    pendienteUsd: n(c?.pendienteUsd),
    porVencer: c?.porVencer ?? 0,
    cobradoMesUsd: n(p?.cobradoMesUsd),
    facturadoMesUsd: n(f?.facturadoMesUsd),
    tasa: await tasaVigente(),
  };
}

/** Lo que ve el cliente en la app: sus cuotas pendientes y saldos, en dólares y en bolívares del día. */
export async function cobrosParaApp(clienteIds: number[]) {
  const tasa = await tasaVigente();
  const hoy = hoyCentral();
  const clientes = [];
  for (const id of clienteIds) {
    const e = await estadoDeCuenta(id);
    if (!e) continue;
    // Exonerado: no se le muestra deuda ni plan, solo el aviso
    if (e.cliente.exonerado && e.pendienteUsd === 0 && e.pagos.length === 0) {
      clientes.push({ clienteId: id, nombre: e.cliente.nombre, exonerado: true, dispositivos: [], cuotasPendientes: [], ultimosPagos: [], pendienteUsd: 0, vencidoUsd: 0, saldoAFavorUsd: 0, pendienteBs: null });
      continue;
    }
    clientes.push({
      clienteId: id,
      nombre: e.cliente.nombre,
      exonerado: e.cliente.exonerado,
      dispositivos: e.dispositivos
        .filter((d) => d.activo && d.precioUsd !== null)
        .map((d) => ({ panelId: d.panelId, numeroCuenta: d.numeroCuenta, prefijo: d.prefijo, sitioNombre: d.sitioNombre, exonerado: d.exonerado, plan: d.planNombre, precioUsd: d.precioUsd, meses: d.meses, proximoVencimiento: d.proximoVencimiento })),
      cuotasPendientes: e.cuotas
        .filter((q) => q.estado === 'pendiente')
        .map((q) => ({ id: q.id, concepto: q.concepto, numeroCuenta: q.numeroCuenta, prefijo: q.prefijo, venceEn: q.venceEn, montoUsd: q.montoUsd, pagadoUsd: q.pagadoUsd, vencida: q.venceEn < hoy })),
      ultimosPagos: e.pagos.filter((p) => p.estado !== 'anulado').slice(0, 10).map((p) => ({ id: p.id, fecha: p.fecha, montoUsd: p.montoUsd, montoBs: p.montoBs, forma: p.forma, referencia: p.referencia, estado: p.estado })),
      pendienteUsd: e.pendienteUsd,
      vencidoUsd: e.vencidoUsd,
      saldoAFavorUsd: e.saldoAFavorUsd,
      pendienteBs: tasa ? usdABs(e.pendienteUsd, tasa.valor) : null,
    });
  }
  return { tasa, clientes };
}

// ---- Avisos al cliente (solo avisar: nunca se corta nada) ----

async function tokensDelCliente(clienteId: number): Promise<{ token: string; usuarioId: number }[]> {
  const gente = await db
    .selectDistinct({ usuarioId: acceso.usuarioId })
    .from(acceso)
    .innerJoin(usuario, eq(acceso.usuarioId, usuario.id))
    .where(and(eq(acceso.clienteId, clienteId), eq(usuario.activo, true), eq(usuario.rol, 'cliente')));
  if (gente.length === 0) return [];
  return db
    .select({ token: dispositivoPush.token, usuarioId: dispositivoPush.usuarioId })
    .from(dispositivoPush)
    .where(inArray(dispositivoPush.usuarioId, gente.map((g) => g.usuarioId)));
}

function montoHablado(usd: number, tasa: { valor: number } | null): string {
  return tasa ? `${formatearUsd(usd)} (${formatearBs(usdABs(usd, tasa.valor))})` : formatearUsd(usd);
}

/** Avisa por push las cuotas nuevas y las que acaban de vencer. Cada cuota se avisa una sola vez por motivo. */
export async function avisarCuotas(log: Log): Promise<{ nuevas: number; vencidas: number }> {
  const resultado = { nuevas: 0, vencidas: 0 };
  if (!pushDisponible()) return resultado;
  const hoy = hoyCentral();
  const tasa = await tasaVigente();
  const pendientes = await db
    .select({ id: cuota.id, clienteId: cuota.clienteId, concepto: cuota.concepto, venceEn: cuota.venceEn, montoUsd: cuota.montoUsd, pagadoUsd: cuota.pagadoUsd, avisadaEn: cuota.avisadaEn, avisoMoraEn: cuota.avisoMoraEn, numeroCuenta: panel.numeroCuenta, prefijo: panel.prefijo })
    .from(cuota)
    .innerJoin(panel, eq(cuota.panelId, panel.id))
    .where(eq(cuota.estado, 'pendiente'));
  for (const q of pendientes) {
    const falta = n(q.montoUsd) - n(q.pagadoUsd);
    const cuenta = q.prefijo ? `${q.prefijo}-${q.numeroCuenta}` : q.numeroCuenta;
    const [d, m] = [q.venceEn.slice(8, 10), q.venceEn.slice(5, 7)];
    let mensaje: { titulo: string; cuerpo: string } | null = null;
    let marca: 'avisadaEn' | 'avisoMoraEn' | null = null;
    if (!q.avisadaEn) {
      mensaje = { titulo: 'Nueva cuota de monitoreo', cuerpo: `${q.concepto}, cuenta ${cuenta}: ${montoHablado(falta, tasa)}. Vence el ${d}/${m}.` };
      marca = 'avisadaEn';
    } else if (!q.avisoMoraEn && q.venceEn < hoy) {
      mensaje = { titulo: 'Cuota vencida', cuerpo: `${q.concepto}, cuenta ${cuenta}: ${montoHablado(falta, tasa)} pendiente desde el ${d}/${m}. El servicio sigue activo; por favor regularice su pago.` };
      marca = 'avisoMoraEn';
    }
    if (!mensaje || !marca) continue;
    try {
      const tokens = await tokensDelCliente(q.clienteId);
      for (const t of tokens) {
        const r = await enviarPush(t.token, { titulo: mensaje.titulo, cuerpo: mensaje.cuerpo, habla: '', canal: 'avisos', datos: { cuotaId: String(q.id), categoria: 'cobro' } }, t.usuarioId);
        if (r === 'token-invalido') await db.delete(dispositivoPush).where(eq(dispositivoPush.token, t.token));
      }
      await db.update(cuota).set({ [marca]: new Date() }).where(eq(cuota.id, q.id));
      if (marca === 'avisadaEn') resultado.nuevas++;
      else resultado.vencidas++;
    } catch (err) {
      log.warn({ err: (err as Error).message, cuotaId: q.id }, 'No se pudo avisar la cuota');
    }
  }
  return resultado;
}

/** Corrida completa: genera lo que toca y avisa. Nunca lanza. */
export async function correrCobros(log: Log): Promise<{ creadas: number; nuevas: number; vencidas: number }> {
  try {
    const creadas = await generarCuotas();
    const avisos = await avisarCuotas(log);
    if (creadas || avisos.nuevas || avisos.vencidas) log.info({ creadas, ...avisos }, 'Cobros: cuotas generadas y avisadas');
    return { creadas, ...avisos };
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Fallo en la corrida de cobros');
    return { creadas: 0, nuevas: 0, vencidas: 0 };
  }
}

/** Arranca la corrida de cobros: una al iniciar y otra cada 6 h. */
export function iniciarCobros(log: Log): () => void {
  const cada = Number(process.env.COBROS_CADA_HORAS ?? 6);
  if (!(cada > 0)) return () => {};
  const primera = setTimeout(() => void correrCobros(log), 10_000);
  const periodica = setInterval(() => void correrCobros(log), cada * 3_600_000);
  primera.unref();
  periodica.unref();
  return () => {
    clearTimeout(primera);
    clearInterval(periodica);
  };
}
