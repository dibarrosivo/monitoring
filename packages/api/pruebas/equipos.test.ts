import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Cuenta secundaria del equipo y catálogo de marcas/modelos/instaladores.
 * La cuenta secundaria es la que evita que una señal llegada por la segunda vía
 * de comunicación aparezca como "cuenta desconocida".
 */

let ctx: Contexto;
let tokenAdmin: string;
let sitioId: number;

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
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');
  const clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente E' } }))
    .cuerpo.id;
  sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Sitio E' } }))
    .cuerpo.id;
});

describe('cuenta secundaria', () => {
  it('una señal con la cuenta secundaria se atribuye al mismo equipo', async () => {
    const panelId = (
      await ctx.pedir('POST', '/paneles', {
        token: tokenAdmin,
        cuerpo: { sitioId, numeroCuenta: 'D001', cuentaSecundaria: 'D999' },
      })
    ).cuerpo.id;

    const { buscarPanelPorCuenta } = await import('@monitoring/engine');
    expect((await buscarPanelPorCuenta('D001'))?.id).toBe(panelId);
    expect((await buscarPanelPorCuenta('D999'))?.id).toBe(panelId);
    expect(await buscarPanelPorCuenta('D555')).toBeNull();
  });

  it('rechaza una cuenta secundaria ya usada por otro equipo', async () => {
    await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'E001' } });
    const res = await ctx.pedir('POST', '/paneles', {
      token: tokenAdmin,
      cuerpo: { sitioId, numeroCuenta: 'E002', cuentaSecundaria: 'E001' },
    });
    expect(res.estado).toBe(409);
  });

  it('rechaza que la secundaria sea igual a la principal', async () => {
    const res = await ctx.pedir('POST', '/paneles', {
      token: tokenAdmin,
      cuerpo: { sitioId, numeroCuenta: 'F001', cuentaSecundaria: 'F001' },
    });
    expect(res.estado).toBe(409);
  });

  it('al editar, el equipo no choca consigo mismo', async () => {
    const panelId = (
      await ctx.pedir('POST', '/paneles', {
        token: tokenAdmin,
        cuerpo: { sitioId, numeroCuenta: 'A001', cuentaSecundaria: 'A002' },
      })
    ).cuerpo.id;
    const res = await ctx.pedir('PUT', `/paneles/${panelId}`, {
      token: tokenAdmin,
      cuerpo: { numeroCuenta: 'A001', cuentaSecundaria: 'A002', alias: 'Portón' },
    });
    expect(res.estado).toBe(200);
  });
});

describe('catálogo de equipos', () => {
  it('se alimenta solo con lo que se carga y no repite valores', async () => {
    await ctx.pedir('POST', '/paneles', {
      token: tokenAdmin,
      cuerpo: { sitioId, numeroCuenta: 'B001', marca: 'Bosch', modelo: 'AMAX 4000', instalador: 'Juan Pérez' },
    });
    await ctx.pedir('POST', '/paneles', {
      token: tokenAdmin,
      cuerpo: { sitioId, numeroCuenta: 'B002', marca: 'Bosch', modelo: 'AMAX 2100' },
    });

    const marcas = (await ctx.pedir('GET', '/catalogos?tipo=marca', { token: tokenAdmin })).cuerpo;
    expect(marcas.map((m: { valor: string }) => m.valor)).toEqual(['Bosch']);

    const modelos = (await ctx.pedir('GET', '/catalogos?tipo=modelo', { token: tokenAdmin })).cuerpo;
    expect(modelos.map((m: { valor: string }) => m.valor)).toEqual(['AMAX 2100', 'AMAX 4000']);

    const instaladores = (await ctx.pedir('GET', '/catalogos?tipo=instalador', { token: tokenAdmin })).cuerpo;
    expect(instaladores.map((i: { valor: string }) => i.valor)).toEqual(['Juan Pérez']);
  });

  it('editar un equipo también suma el valor nuevo', async () => {
    const panelId = (
      await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'C001' } })
    ).cuerpo.id;
    await ctx.pedir('PUT', `/paneles/${panelId}`, { token: tokenAdmin, cuerpo: { marca: 'DSC' } });

    const marcas = (await ctx.pedir('GET', '/catalogos?tipo=marca', { token: tokenAdmin })).cuerpo;
    expect(marcas.map((m: { valor: string }) => m.valor)).toEqual(['DSC']);
  });
});
