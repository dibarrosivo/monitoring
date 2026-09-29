import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * El dueño: una sola cuenta que es personal de la central y además cliente de
 * sí mismo. Ve su alarma y opera la consola, sin mezclar datos de nadie.
 */

let ctx: Contexto;
let tokenAdmin: string;
let adminId: number;
let clienteId: number;

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
  adminId = await crearUsuarioDirecto({ email: 'dueno@test.local', nombre: 'Dueño', clave: 'dueno123', rol: 'admin' });
  tokenAdmin = await ctx.ingresar('dueno@test.local', 'dueno123');
  clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Su casa' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Casa' } })).cuerpo.id;
  await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'CA5A' } });
});

describe('una cuenta para las dos cosas', () => {
  it('sin accesos, el login no marca que sea cliente y las rutas de cliente no devuelven nada suyo', async () => {
    const login = (await ctx.pedir('POST', '/auth/login', { cuerpo: { email: 'dueno@test.local', clave: 'dueno123' } })).cuerpo;
    expect(login.usuario.tieneAcceso).toBe(false);
    const resumen = await ctx.pedir('GET', '/cliente/resumen', { token: tokenAdmin });
    expect(resumen.estado).toBe(200);
    expect(resumen.cuerpo.paneles).toEqual([]);
  });

  it('con acceso, el login lo marca y ve su propio sitio desde la app de cliente', async () => {
    await ctx.pedir('POST', '/accesos', { token: tokenAdmin, cuerpo: { usuarioId: adminId, clienteId } });
    const login = (await ctx.pedir('POST', '/auth/login', { cuerpo: { email: 'dueno@test.local', clave: 'dueno123' } })).cuerpo;
    expect(login.usuario.tieneAcceso).toBe(true);
    const resumen = await ctx.pedir('GET', '/cliente/resumen', { token: login.token });
    expect(resumen.estado).toBe(200);
    expect(resumen.cuerpo.paneles.map((p: { numeroCuenta: string }) => p.numeroCuenta)).toEqual(['CA5A']);
  });

  it('sigue viendo la consola: la vista de cliente no le quita permisos de central', async () => {
    await ctx.pedir('POST', '/accesos', { token: tokenAdmin, cuerpo: { usuarioId: adminId, clienteId } });
    expect((await ctx.pedir('GET', '/tablero', { token: tokenAdmin })).estado).toBe(200);
    expect((await ctx.pedir('GET', '/turnos', { token: tokenAdmin })).estado).toBe(200);
  });

  it('no ve los equipos de otro cliente por la vía de la app', async () => {
    await ctx.pedir('POST', '/accesos', { token: tokenAdmin, cuerpo: { usuarioId: adminId, clienteId } });
    const otro = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Ajeno' } })).cuerpo.id;
    const sitioAjeno = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId: otro, nombre: 'Local ajeno' } })).cuerpo.id;
    const panelAjeno = (await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId: sitioAjeno, numeroCuenta: 'DEAD' } })).cuerpo.id;
    const resumen = (await ctx.pedir('GET', '/cliente/resumen', { token: tokenAdmin })).cuerpo;
    expect(resumen.paneles.map((p: { numeroCuenta: string }) => p.numeroCuenta)).toEqual(['CA5A']);
    expect((await ctx.pedir('GET', `/cliente/paneles/${panelAjeno}/zonas`, { token: tokenAdmin })).estado).toBe(404);
  });
});
