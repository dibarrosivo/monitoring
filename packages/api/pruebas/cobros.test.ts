import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Cobros: plan por dispositivo, cuotas generadas al llegar el período, pagos
 * aplicados a las más viejas, saldo a favor, y lo que ve el cliente en la app.
 */

let ctx: Contexto;
let tokenAdmin: string;
let tokenOperador: string;
let tokenCliente: string;
let clienteId: number;
let panelId: number;
let planId: number;

const hoy = new Date().toISOString().slice(0, 10);
/** Las cuotas vencen 5 días después de empezar el período: la del mes en curso ya venció si pasó el día 6 */
const actualVencida = hoy.slice(8) > '06';
const vencidasIniciales = actualVencida ? 3 : 2;
const vencidoInicial = actualVencida ? 75 : 50;

beforeAll(async () => {
  await prepararBaseDePruebas();
  ctx = await crearContexto();
});

afterAll(async () => {
  await ctx.app.close();
  const { pool } = await import('@monitoring/db');
  await pool.end();
});

beforeEach(async () => {
  await limpiarBase();
  await crearUsuarioDirecto({ email: 'admin@test.local', nombre: 'Admin', clave: 'admin123', rol: 'admin' });
  await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Operador', clave: 'oper123', rol: 'operador' });
  const clienteUsuarioId = await crearUsuarioDirecto({ email: 'dueno@test.local', nombre: 'Dueño', clave: 'dueno123', rol: 'cliente' });
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');
  tokenOperador = await ctx.ingresar('oper@test.local', 'oper123');
  clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Panadería K3' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Local' } })).cuerpo.id;
  planId = (await ctx.pedir('POST', '/planes', { token: tokenAdmin, cuerpo: { nombre: 'Comercial', precioUsd: 25, frecuenciaMeses: 1 } })).cuerpo.id;
  // El primer período empezó hace dos meses: al generar deben salir tres cuotas (dos vencidas y la actual)
  const inicio = new Date();
  inicio.setUTCMonth(inicio.getUTCMonth() - 2);
  inicio.setUTCDate(1);
  panelId = (await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'ABC3', planId, proximoVencimiento: inicio.toISOString().slice(0, 10) } })).cuerpo.id;
  await ctx.pedir('POST', '/accesos', { token: tokenAdmin, cuerpo: { usuarioId: clienteUsuarioId, clienteId } });
  tokenCliente = await ctx.ingresar('dueno@test.local', 'dueno123');
});

describe('planes', () => {
  it('se crean con precio en dólares; el nombre no se repite; el operador no los toca', async () => {
    expect((await ctx.pedir('POST', '/planes', { token: tokenAdmin, cuerpo: { nombre: 'Comercial', precioUsd: 30 } })).estado).toBe(409);
    expect((await ctx.pedir('POST', '/planes', { token: tokenOperador, cuerpo: { nombre: 'Otro', precioUsd: 30 } })).estado).toBe(403);
    const lista = await ctx.pedir('GET', '/planes', { token: tokenOperador });
    expect(lista.cuerpo).toEqual([expect.objectContaining({ nombre: 'Comercial', precioUsd: 25, frecuenciaMeses: 1, activo: true })]);
  });
});

describe('cuotas', () => {
  it('se generan por cada período ya empezado y el próximo vencimiento corre', async () => {
    const r = await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin });
    expect(r.cuerpo.creadas).toBe(3);
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    expect(e.cuotas).toHaveLength(3);
    expect(e.cuotas.every((q: { montoUsd: number; estado: string }) => q.montoUsd === 25 && q.estado === 'pendiente')).toBe(true);
    expect(e.pendienteUsd).toBe(75);
    expect(e.vencidoUsd).toBe(vencidoInicial);
    expect(e.dispositivos[0].proximoVencimiento > hoy).toBe(true);
    // Volver a generar no duplica
    expect((await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin })).cuerpo.creadas).toBe(0);
  });

  it('el precio especial del dispositivo manda sobre el del plan', async () => {
    await ctx.pedir('PUT', `/paneles/${panelId}`, { token: tokenAdmin, cuerpo: { montoAbono: '20' } });
    await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin });
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    expect(e.cuotas[0].montoUsd).toBe(20);
    expect(e.dispositivos[0].precioUsd).toBe(20);
  });

  it('un dispositivo o un cliente exonerado no generan cuotas, aunque tengan plan', async () => {
    await ctx.pedir('PUT', `/paneles/${panelId}`, { token: tokenAdmin, cuerpo: { exonerado: true } });
    expect((await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin })).cuerpo.creadas).toBe(0);
    await ctx.pedir('PUT', `/paneles/${panelId}`, { token: tokenAdmin, cuerpo: { exonerado: false } });
    await ctx.pedir('PUT', `/clientes/${clienteId}`, { token: tokenAdmin, cuerpo: { nombre: 'Panadería K3', exonerado: true } });
    expect((await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin })).cuerpo.creadas).toBe(0);
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    expect(e.cliente.exonerado).toBe(true);
    const app = (await ctx.pedir('GET', '/cliente/cobros', { token: tokenCliente })).cuerpo;
    expect(app.clientes[0]).toMatchObject({ exonerado: true, pendienteUsd: 0, cuotasPendientes: [] });
    // Al quitar la exoneración vuelve a cobrar desde donde quedó
    await ctx.pedir('PUT', `/clientes/${clienteId}`, { token: tokenAdmin, cuerpo: { nombre: 'Panadería K3', exonerado: false } });
    expect((await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin })).cuerpo.creadas).toBe(3);
  });

  it('un dispositivo sin plan ni monto no genera nada', async () => {
    await ctx.pedir('PUT', `/paneles/${panelId}`, { token: tokenAdmin, cuerpo: { planId: null } });
    expect((await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin })).cuerpo.creadas).toBe(0);
  });

  it('el resumen y la lista muestran al moroso', async () => {
    await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin });
    const resumen = (await ctx.pedir('GET', '/cobros/resumen', { token: tokenOperador })).cuerpo;
    expect(resumen.morosos).toBe(1);
    expect(resumen.vencidoUsd).toBe(vencidoInicial);
    expect(resumen.pendienteUsd).toBe(75);
    const lista = (await ctx.pedir('GET', '/cobros/clientes', { token: tokenOperador })).cuerpo;
    expect(lista).toEqual([expect.objectContaining({ clienteId, nombre: 'Panadería K3', dispositivos: 1, pendienteUsd: 75, vencidoUsd: vencidoInicial, cuotasVencidas: vencidasIniciales, ultimoPago: null })]);
  });
});

describe('pagos', () => {
  beforeEach(async () => {
    await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin });
  });

  it('se aplican a las cuotas más viejas primero y lo que sobra queda a favor', async () => {
    const r = await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenAdmin, cuerpo: { montoUsd: 60, forma: 'zelle', fecha: hoy } });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.aplicadoUsd).toBe(60);
    expect(r.cuerpo.saldoAFavorUsd).toBe(0);
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    const porPeriodo = [...e.cuotas].sort((a: { periodoDesde: string }, b: { periodoDesde: string }) => a.periodoDesde.localeCompare(b.periodoDesde));
    expect(porPeriodo.map((q: { estado: string; pagadoUsd: number }) => [q.estado, q.pagadoUsd])).toEqual([
      ['pagada', 25],
      ['pagada', 25],
      ['pendiente', 10],
    ]);
    expect(e.pendienteUsd).toBe(15);
    expect(e.vencidoUsd).toBe(actualVencida ? 15 : 0);

    const sobra = await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenAdmin, cuerpo: { montoUsd: 40, forma: 'efectivo', fecha: hoy } });
    expect(sobra.cuerpo.aplicadoUsd).toBe(15);
    expect(sobra.cuerpo.saldoAFavorUsd).toBe(25);
  });

  it('el saldo a favor cubre solo la cuota siguiente', async () => {
    await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenAdmin, cuerpo: { montoUsd: 100, forma: 'transferencia', fecha: hoy } });
    // Se adelanta el próximo período a hoy para forzar una cuota nueva
    await ctx.pedir('PUT', `/paneles/${panelId}`, { token: tokenAdmin, cuerpo: { proximoVencimiento: hoy } });
    await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin });
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    expect(e.cuotas).toHaveLength(4);
    expect(e.cuotas.every((q: { estado: string }) => q.estado === 'pagada')).toBe(true);
    expect(e.saldoAFavorUsd).toBe(0);
  });

  it('en bolívares se convierte con la tasa indicada y se guardan ambos montos', async () => {
    const r = await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenAdmin, cuerpo: { montoBs: 21391.56, tasa: 855.6625, forma: 'pago_movil', referencia: '4471', fecha: hoy } });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.pago.montoUsd).toBe(25);
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    expect(e.pagos[0]).toMatchObject({ montoUsd: 25, montoBs: 21391.56, tasa: 855.6625, forma: 'pago_movil', referencia: '4471', registradoPorNombre: 'Admin' });
    expect((await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenAdmin, cuerpo: { montoBs: 100, forma: 'efectivo', fecha: hoy } })).estado).toBe(400);
  });

  it('anular un pago devuelve las cuotas a pendientes; el operador no registra ni anula', async () => {
    expect((await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenOperador, cuerpo: { montoUsd: 25, forma: 'efectivo', fecha: hoy } })).estado).toBe(403);
    const r = await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenAdmin, cuerpo: { montoUsd: 25, forma: 'efectivo', fecha: hoy } });
    expect((await ctx.pedir('POST', `/cobros/pagos/${r.cuerpo.pago.id}/anular`, { token: tokenOperador })).estado).toBe(403);
    expect((await ctx.pedir('POST', `/cobros/pagos/${r.cuerpo.pago.id}/anular`, { token: tokenAdmin })).estado).toBe(200);
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    expect(e.pendienteUsd).toBe(75);
    expect(e.pagos[0].estado).toBe('anulado');
    expect(e.cuotas.every((q: { pagadoUsd: number }) => q.pagadoUsd === 0)).toBe(true);
  });

  it('una cuota con pagos no se anula; una sin pagos sí', async () => {
    const e = (await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo;
    const masVieja = [...e.cuotas].sort((a: { periodoDesde: string }, b: { periodoDesde: string }) => a.periodoDesde.localeCompare(b.periodoDesde))[0];
    await ctx.pedir('POST', `/cobros/clientes/${clienteId}/pagos`, { token: tokenAdmin, cuerpo: { montoUsd: 5, forma: 'efectivo', fecha: hoy } });
    expect((await ctx.pedir('POST', `/cobros/cuotas/${masVieja.id}/anular`, { token: tokenAdmin })).estado).toBe(409);
    const otra = e.cuotas.find((q: { id: number }) => q.id !== masVieja.id);
    expect((await ctx.pedir('POST', `/cobros/cuotas/${otra.id}/anular`, { token: tokenAdmin })).estado).toBe(200);
    expect((await ctx.pedir('GET', `/cobros/clientes/${clienteId}`, { token: tokenAdmin })).cuerpo.pendienteUsd).toBe(45);
  });
});

describe('lo que ve el cliente en la app', () => {
  it('su plan, sus cuotas pendientes en dólares y en bolívares del día, y nada de otros clientes', async () => {
    await ctx.pedir('POST', '/tasa', { token: tokenAdmin, cuerpo: { valor: 800, fechaValor: '2026-01-01' } });
    await ctx.pedir('POST', '/cobros/generar', { token: tokenAdmin });
    const otro = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Otro' } })).cuerpo.id;
    await ctx.pedir('POST', `/cobros/clientes/${otro}/pagos`, { token: tokenAdmin, cuerpo: { montoUsd: 5, forma: 'efectivo', fecha: hoy } });

    const r = await ctx.pedir('GET', '/cliente/cobros', { token: tokenCliente });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.clientes).toHaveLength(1);
    const c = r.cuerpo.clientes[0];
    expect(c.nombre).toBe('Panadería K3');
    expect(c.dispositivos[0]).toMatchObject({ numeroCuenta: 'ABC3', plan: 'Comercial', precioUsd: 25, meses: 1 });
    expect(c.cuotasPendientes).toHaveLength(3);
    expect(c.cuotasPendientes.filter((q: { vencida: boolean }) => q.vencida)).toHaveLength(vencidasIniciales);
    expect(c.pendienteUsd).toBe(75);
    expect(c.pendienteBs).toBe(60000);
    expect((await ctx.pedir('GET', '/cobros/resumen', { token: tokenCliente })).estado).toBe(403);
  });
});
