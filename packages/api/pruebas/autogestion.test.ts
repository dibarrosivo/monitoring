import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Autogestión desde la app: el propietario administra a los demás usuarios y
 * la lista de llamadas de SU cliente; nadie más, y nunca sobre otro cliente.
 */

let ctx: Contexto;
let tokenAdmin: string;
let tokenPropietario: string;
let tokenEmpleado: string;
let propietarioId: number;
let empleadoId: number;
let clienteA: number;
let clienteB: number;
let sitioA: number;

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
  propietarioId = await crearUsuarioDirecto({ email: 'dueno@test.local', nombre: 'Dueño', clave: 'dueno123', rol: 'cliente' });
  empleadoId = await crearUsuarioDirecto({ email: 'empleado@test.local', nombre: 'Empleado', clave: 'empleado123', rol: 'cliente' });
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');

  clienteA = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente A' } })).cuerpo.id;
  clienteB = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente B' } })).cuerpo.id;
  sitioA = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId: clienteA, nombre: 'Sitio A' } })).cuerpo.id;
  await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId: sitioA, numeroCuenta: 'ABC1' } });
  // El dueño tiene acceso a todo el cliente A y la central lo marca propietario; el empleado solo acceso
  await ctx.pedir('POST', '/accesos', { token: tokenAdmin, cuerpo: { usuarioId: propietarioId, clienteId: clienteA } });
  await ctx.pedir('PUT', `/usuarios/${propietarioId}/propietario`, { token: tokenAdmin, cuerpo: { clienteId: clienteA, propietario: true } });
  await ctx.pedir('POST', '/accesos', { token: tokenAdmin, cuerpo: { usuarioId: empleadoId, clienteId: clienteA } });

  tokenPropietario = await ctx.ingresar('dueno@test.local', 'dueno123');
  tokenEmpleado = await ctx.ingresar('empleado@test.local', 'empleado123');
});

describe('usuarios de la app administrados por el propietario', () => {
  it('el resumen dice de qué clientes es propietario', async () => {
    expect((await ctx.pedir('GET', '/cliente/resumen', { token: tokenPropietario })).cuerpo.propietarioDe).toEqual([clienteA]);
    expect((await ctx.pedir('GET', '/cliente/resumen', { token: tokenEmpleado })).cuerpo.propietarioDe).toEqual([]);
  });

  it('el propietario ve a los usuarios de su cuenta; el empleado no ve a nadie', async () => {
    const lista = (await ctx.pedir('GET', '/cliente/usuarios', { token: tokenPropietario })).cuerpo;
    expect(lista.map((u: { email: string }) => u.email).sort()).toEqual(['dueno@test.local', 'empleado@test.local']);
    expect((await ctx.pedir('GET', '/cliente/usuarios', { token: tokenEmpleado })).cuerpo).toEqual([]);
  });

  it('el propietario agrega una persona y esta entra a la app con acceso a ese cliente', async () => {
    const r = await ctx.pedir('POST', '/cliente/usuarios', {
      token: tokenPropietario,
      cuerpo: { clienteId: clienteA, nombre: 'Esposa', email: 'esposa@test.local', clave: 'esposa123' },
    });
    expect(r.estado).toBe(201);
    const tokenEsposa = await ctx.ingresar('esposa@test.local', 'esposa123');
    const resumen = (await ctx.pedir('GET', '/cliente/resumen', { token: tokenEsposa })).cuerpo;
    expect(resumen.paneles.map((p: { numeroCuenta: string }) => p.numeroCuenta)).toEqual(['ABC1']);
    expect(resumen.propietarioDe).toEqual([]);
  });

  it('el empleado no puede agregar usuarios, ni el propietario sobre otro cliente', async () => {
    const cuerpo = { nombre: 'Intruso', email: 'intruso@test.local', clave: 'intruso123' };
    expect((await ctx.pedir('POST', '/cliente/usuarios', { token: tokenEmpleado, cuerpo: { ...cuerpo, clienteId: clienteA } })).estado).toBe(403);
    expect((await ctx.pedir('POST', '/cliente/usuarios', { token: tokenPropietario, cuerpo: { ...cuerpo, clienteId: clienteB } })).estado).toBe(403);
  });

  it('no se puede dar de alta con el correo de alguien de la central', async () => {
    const r = await ctx.pedir('POST', '/cliente/usuarios', {
      token: tokenPropietario,
      cuerpo: { clienteId: clienteA, nombre: 'Xavier', email: 'admin@test.local', clave: 'loquesea1' },
    });
    expect(r.estado).toBe(409);
  });

  it('el propietario desactiva a un empleado, pero no a sí mismo ni a otro propietario', async () => {
    expect((await ctx.pedir('PUT', `/cliente/usuarios/${empleadoId}`, { token: tokenPropietario, cuerpo: { clienteId: clienteA, activo: false } })).estado).toBe(200);
    expect((await ctx.pedir('POST', '/auth/login', { cuerpo: { email: 'empleado@test.local', clave: 'empleado123' } })).estado).toBe(401);
    expect((await ctx.pedir('PUT', `/cliente/usuarios/${propietarioId}`, { token: tokenPropietario, cuerpo: { clienteId: clienteA, activo: false } })).estado).toBe(400);
  });
});

describe('lista de llamadas administrada por el propietario', () => {
  it('agregar, cambiar y quitar un contacto queda auditado y avisa a la central', async () => {
    const alta = await ctx.pedir('POST', '/cliente/contactos', {
      token: tokenPropietario,
      cuerpo: { clienteId: clienteA, nombre: 'Juan Pérez', telefono: '04141234567', rol: 'Encargado' },
    });
    expect(alta.estado).toBe(201);
    const id = alta.cuerpo.id;
    expect((await ctx.pedir('PUT', `/cliente/contactos/${id}`, { token: tokenPropietario, cuerpo: { telefono: '04149999999' } })).estado).toBe(200);
    expect((await ctx.pedir('DELETE', `/cliente/contactos/${id}`, { token: tokenPropietario })).estado).toBe(200);

    // La central lo ve en el diario de eventos, sin alarma
    const eventos = (await ctx.pedir('GET', '/eventos', { token: tokenAdmin })).cuerpo;
    const avisos = eventos.filter((e: { codigo: string }) => e.codigo === 'CLI-LLAM');
    expect(avisos).toHaveLength(3);
    expect(avisos[0].descripcion).toContain('quitó a Juan Pérez');
    expect((await ctx.pedir('GET', '/alarmas', { token: tokenAdmin })).cuerpo).toHaveLength(0);
    // ...y la lista de la central quedó igual que la de la app
    expect((await ctx.pedir('GET', `/clientes/${clienteA}`, { token: tokenAdmin })).cuerpo.contactos).toHaveLength(0);
  });

  it('el empleado no ve ni toca la lista de llamadas', async () => {
    expect((await ctx.pedir('GET', '/cliente/contactos', { token: tokenEmpleado })).cuerpo).toEqual([]);
    const r = await ctx.pedir('POST', '/cliente/contactos', { token: tokenEmpleado, cuerpo: { clienteId: clienteA, nombre: 'Xavier', telefono: '04140000000' } });
    expect(r.estado).toBe(403);
  });
});
