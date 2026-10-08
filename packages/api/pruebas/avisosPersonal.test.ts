import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

let ctx: Contexto;
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
  await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Daniel', clave: 'clave-oper-123', rol: 'operador' });
  await crearUsuarioDirecto({ email: 'cliente@test.local', nombre: 'Laura', clave: 'clave-cli-1234', rol: 'cliente' });
});

const elegido = { emergencias: false, fallasCentral: true, informativos: false, silencioDesde: '22:00', silencioHasta: '07:00', vozPush: 'solo_alarmas' };

describe('«Mis avisos» del personal', () => {
  it('sin nada guardado le llega todo', async () => {
    const token = await ctx.ingresar('oper@test.local', 'clave-oper-123');
    expect((await ctx.pedir('GET', '/personal/avisos', { token })).cuerpo).toEqual({
      emergencias: true, fallasCentral: true, informativos: true, silencioDesde: null, silencioHasta: null, vozPush: 'siempre',
    });
  });

  it('guarda lo que elige y lo devuelve igual', async () => {
    const token = await ctx.ingresar('oper@test.local', 'clave-oper-123');
    expect((await ctx.pedir('PUT', '/personal/avisos', { token, cuerpo: elegido })).estado).toBe(200);
    expect((await ctx.pedir('GET', '/personal/avisos', { token })).cuerpo).toEqual(elegido);
  });

  it('el horario de silencio lleva desde y hasta, o ninguno', async () => {
    const token = await ctx.ingresar('oper@test.local', 'clave-oper-123');
    expect((await ctx.pedir('PUT', '/personal/avisos', { token, cuerpo: { ...elegido, silencioHasta: null } })).estado).toBe(400);
  });

  it('un cliente no tiene esta pantalla', async () => {
    const token = await ctx.ingresar('cliente@test.local', 'clave-cli-1234');
    expect((await ctx.pedir('GET', '/personal/avisos', { token })).estado).toBe(403);
  });
});
