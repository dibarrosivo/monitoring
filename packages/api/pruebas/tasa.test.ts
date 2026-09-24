import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/** Tasa de cambio: la ve cualquiera con sesión, la carga solo un administrador, y rige desde su fecha de valor. */

let ctx: Contexto;
let tokenAdmin: string;
let tokenOperador: string;

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
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');
  tokenOperador = await ctx.ingresar('oper@test.local', 'oper123');
});

describe('tasa de cambio', () => {
  it('sin tasa cargada, la vigente es null', async () => {
    const r = await ctx.pedir('GET', '/tasa', { token: tokenOperador });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.vigente).toBeNull();
  });

  it('el administrador la carga a mano y rige desde su fecha; una futura no se adelanta', async () => {
    expect((await ctx.pedir('POST', '/tasa', { token: tokenOperador, cuerpo: { valor: 850, fechaValor: '2026-01-01' } })).estado).toBe(403);
    const hoy = await ctx.pedir('POST', '/tasa', { token: tokenAdmin, cuerpo: { valor: 850, fechaValor: '2026-01-01' } });
    expect(hoy.estado).toBe(200);
    expect(hoy.cuerpo.vigente).toMatchObject({ valor: 850, fechaValor: '2026-01-01', fuente: 'manual' });
    const futura = await ctx.pedir('POST', '/tasa', { token: tokenAdmin, cuerpo: { valor: 999, fechaValor: '2999-12-31' } });
    expect(futura.cuerpo.vigente.valor).toBe(850);
    const lista = await ctx.pedir('GET', '/tasa', { token: tokenOperador });
    expect(lista.cuerpo.ultimas.map((t: { valor: number }) => t.valor)).toEqual([999, 850]);
  });

  it('cargar dos veces la misma fecha reemplaza el valor', async () => {
    await ctx.pedir('POST', '/tasa', { token: tokenAdmin, cuerpo: { valor: 850, fechaValor: '2026-01-01' } });
    const r = await ctx.pedir('POST', '/tasa', { token: tokenAdmin, cuerpo: { valor: 851.5, fechaValor: '2026-01-01' } });
    expect(r.cuerpo.vigente.valor).toBe(851.5);
    expect((await ctx.pedir('GET', '/tasa', { token: tokenAdmin })).cuerpo.ultimas).toHaveLength(1);
  });

  it('rechaza valores sin sentido', async () => {
    expect((await ctx.pedir('POST', '/tasa', { token: tokenAdmin, cuerpo: { valor: -1, fechaValor: '2026-01-01' } })).estado).toBe(400);
    expect((await ctx.pedir('POST', '/tasa', { token: tokenAdmin, cuerpo: { valor: 850, fechaValor: 'ayer' } })).estado).toBe(400);
  });
});
