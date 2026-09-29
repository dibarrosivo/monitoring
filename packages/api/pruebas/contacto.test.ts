import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/** Contacto desde la landing: público, con honeypot y tope; el personal lo ve y lo atiende. */

let ctx: Contexto;
let tokenAdmin: string;

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
});

describe('contacto web', () => {
  it('guarda el pedido sin sesión y el personal lo ve y lo marca atendido', async () => {
    const r = await ctx.pedir('POST', '/contacto', { cuerpo: { nombre: 'María Pérez', telefono: '0414 1234567', motivo: 'plan', mensaje: 'Me interesa el plan Comercial.' } });
    expect(r.estado).toBe(200);
    expect((await ctx.pedir('GET', '/contactos-web')).estado).toBe(401);
    const lista = (await ctx.pedir('GET', '/contactos-web', { token: tokenAdmin })).cuerpo;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ nombre: 'María Pérez', telefono: '0414 1234567', motivo: 'plan', atendidoEn: null });
    const at = await ctx.pedir('POST', `/contactos-web/${lista[0].id}/atendido`, { token: tokenAdmin });
    expect(at.cuerpo.atendidoEn).not.toBeNull();
  });
  it('el honeypot responde ok pero no guarda; los datos incompletos dan 400', async () => {
    expect((await ctx.pedir('POST', '/contacto', { cuerpo: { nombre: 'Bot', telefono: '123456', sitioWeb: 'http://spam' } })).estado).toBe(200);
    expect((await ctx.pedir('POST', '/contacto', { cuerpo: { nombre: 'X' } })).estado).toBe(400);
    expect((await ctx.pedir('GET', '/contactos-web', { token: tokenAdmin })).cuerpo).toHaveLength(0);
  });
});
