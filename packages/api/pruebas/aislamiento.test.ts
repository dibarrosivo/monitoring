import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Garantías de aislamiento: son las que más caro salen si se rompen, así que
 * se prueban sobre HTTP real (inject) y no a mano con curl.
 */

let ctx: Contexto;
let tokenAdmin: string;
let tokenOperador: string;
let tokenCliente: string;
let clienteA: number;
let clienteB: number;
let sitioA: number;
let panelA: number;
let panelA2: number;
let panelB: number;
let usuarioClienteId: number;

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
  usuarioClienteId = await crearUsuarioDirecto({
    email: 'cliente@test.local',
    nombre: 'Cliente App',
    clave: 'cliente123',
    rol: 'cliente',
  });

  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');
  tokenOperador = await ctx.ingresar('oper@test.local', 'oper123');
  tokenCliente = await ctx.ingresar('cliente@test.local', 'cliente123');

  // Cliente A con dos dispositivos; cliente B ajeno
  clienteA = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente A' } })).cuerpo.id;
  clienteB = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente B' } })).cuerpo.id;
  sitioA = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId: clienteA, nombre: 'Sitio A' } }))
    .cuerpo.id;
  const sitioB = (
    await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId: clienteB, nombre: 'Sitio B' } })
  ).cuerpo.id;
  panelA = (
    await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId: sitioA, numeroCuenta: 'AAA1' } })
  ).cuerpo.id;
  panelA2 = (
    await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId: sitioA, numeroCuenta: 'AAA2' } })
  ).cuerpo.id;
  panelB = (
    await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId: sitioB, numeroCuenta: 'BBB1' } })
  ).cuerpo.id;
});

describe('autenticación', () => {
  it('rechaza credenciales incorrectas', async () => {
    const { estado } = await ctx.pedir('POST', '/auth/login', {
      cuerpo: { email: 'admin@test.local', clave: 'incorrecta' },
    });
    expect(estado).toBe(401);
  });

  it('rechaza pedidos sin token', async () => {
    expect((await ctx.pedir('GET', '/alarmas')).estado).toBe(401);
    expect((await ctx.pedir('GET', '/clientes')).estado).toBe(401);
  });

  it('rechaza un token inventado', async () => {
    const { estado } = await ctx.pedir('GET', '/alarmas', { token: 'token.falso.invalido' });
    expect(estado).toBe(401);
  });

  it('no revela el hash de la clave al ingresar', async () => {
    const { cuerpo } = await ctx.pedir('POST', '/auth/login', {
      cuerpo: { email: 'admin@test.local', clave: 'admin123' },
    });
    expect(JSON.stringify(cuerpo)).not.toContain('scrypt');
  });
});

describe('compuerta de personal (soloPersonal)', () => {
  const rutasDePersonal = [
    '/alarmas',
    '/clientes',
    '/paneles',
    '/paneles/estado',
    '/eventos',
    '/senales',
    '/usuarios',
    '/tablero',
    '/configuracion',
  ];

  it('un usuario de la app no entra a ninguna ruta de la central', async () => {
    for (const ruta of rutasDePersonal) {
      const { estado } = await ctx.pedir('GET', ruta, { token: tokenCliente });
      expect({ ruta, estado }).toEqual({ ruta, estado: 403 });
    }
  });

  it('el personal no entra a las rutas de la app de clientes', async () => {
    for (const token of [tokenAdmin, tokenOperador]) {
      expect((await ctx.pedir('GET', '/cliente/resumen', { token })).estado).toBe(403);
      expect((await ctx.pedir('GET', '/cliente/alarmas', { token })).estado).toBe(403);
    }
  });
});

describe('alcance de los accesos del cliente', () => {
  it('sin accesos no ve ningún dispositivo', async () => {
    const { estado, cuerpo } = await ctx.pedir('GET', '/cliente/resumen', { token: tokenCliente });
    expect(estado).toBe(200);
    expect(cuerpo.paneles).toEqual([]);
  });

  it('con acceso a todo el cliente ve sus dispositivos y ninguno ajeno', async () => {
    await ctx.pedir('POST', '/accesos', {
      token: tokenAdmin,
      cuerpo: { usuarioId: usuarioClienteId, clienteId: clienteA },
    });
    const { cuerpo } = await ctx.pedir('GET', '/cliente/resumen', { token: tokenCliente });
    const cuentas = cuerpo.paneles.map((p: { numeroCuenta: string }) => p.numeroCuenta).sort();
    expect(cuentas).toEqual(['AAA1', 'AAA2']);
  });

  it('con acceso a un panel puntual ve solo ese', async () => {
    await ctx.pedir('POST', '/accesos', {
      token: tokenAdmin,
      cuerpo: { usuarioId: usuarioClienteId, clienteId: clienteA, panelId: panelA2 },
    });
    const { cuerpo } = await ctx.pedir('GET', '/cliente/resumen', { token: tokenCliente });
    expect(cuerpo.paneles.map((p: { numeroCuenta: string }) => p.numeroCuenta)).toEqual(['AAA2']);
  });

  it('con acceso a un sitio ve los dispositivos de ese sitio', async () => {
    await ctx.pedir('POST', '/accesos', {
      token: tokenAdmin,
      cuerpo: { usuarioId: usuarioClienteId, clienteId: clienteA, sitioId: sitioA },
    });
    const { cuerpo } = await ctx.pedir('GET', '/cliente/resumen', { token: tokenCliente });
    expect(cuerpo.paneles).toHaveLength(2);
  });

  it('quitar el acceso corta la visibilidad en el pedido siguiente', async () => {
    const { cuerpo: acceso } = await ctx.pedir('POST', '/accesos', {
      token: tokenAdmin,
      cuerpo: { usuarioId: usuarioClienteId, clienteId: clienteA },
    });
    expect((await ctx.pedir('GET', '/cliente/resumen', { token: tokenCliente })).cuerpo.paneles).toHaveLength(2);

    await ctx.pedir('DELETE', `/accesos/${acceso.id}`, { token: tokenAdmin });
    expect((await ctx.pedir('GET', '/cliente/resumen', { token: tokenCliente })).cuerpo.paneles).toEqual([]);
  });

  it('rechaza un acceso cuyo panel no pertenece al cliente indicado', async () => {
    const { estado } = await ctx.pedir('POST', '/accesos', {
      token: tokenAdmin,
      cuerpo: { usuarioId: usuarioClienteId, clienteId: clienteA, panelId: panelB },
    });
    expect(estado).toBe(400);
  });
});

describe('botón de pánico', () => {
  beforeEach(async () => {
    await ctx.pedir('POST', '/accesos', {
      token: tokenAdmin,
      cuerpo: { usuarioId: usuarioClienteId, clienteId: clienteA },
    });
  });

  it('abre una alarma de prioridad máxima en la cola del operador', async () => {
    const { estado, cuerpo } = await ctx.pedir('POST', '/cliente/panico', {
      token: tokenCliente,
      cuerpo: { sitioId: sitioA },
    });
    expect(estado).toBe(201);
    expect(cuerpo.recibido).toBe(true);

    const cola = await ctx.pedir('GET', '/alarmas', { token: tokenOperador });
    const alarma = cola.cuerpo.find((a: { id: number }) => a.id === cuerpo.alarmaId);
    expect(alarma.prioridad).toBe(1);
    expect(alarma.evento.codigo).toBe('PANICO');
  });

  it('no permite disparar el pánico en un sitio ajeno', async () => {
    const sitiosAjenos = await ctx.pedir('GET', `/clientes/${clienteB}`, { token: tokenAdmin });
    const sitioAjeno = sitiosAjenos.cuerpo.sitios[0].id;
    const { estado } = await ctx.pedir('POST', '/cliente/panico', {
      token: tokenCliente,
      cuerpo: { sitioId: sitioAjeno },
    });
    expect(estado).toBe(404);
  });
});

describe('permisos de administración', () => {
  it('un operador no crea usuarios ni cambia la configuración', async () => {
    const alta = await ctx.pedir('POST', '/usuarios', {
      token: tokenOperador,
      cuerpo: { email: 'nuevo@test.local', nombre: 'Nuevo', clave: 'clave123', rol: 'operador' },
    });
    expect(alta.estado).toBe(403);

    const config = await ctx.pedir('PUT', '/configuracion/hombre-muerto', {
      token: tokenOperador,
      cuerpo: { activo: false, intervaloMin: 30, respuestaSeg: 90 },
    });
    expect(config.estado).toBe(403);
  });

  it('un operador sí lee la configuración (la consola la necesita)', async () => {
    const { estado, cuerpo } = await ctx.pedir('GET', '/configuracion', { token: tokenOperador });
    expect(estado).toBe(200);
    expect(cuerpo.hombreMuerto.activo).toBe(true);
  });

  it('un operador no puede impersonar', async () => {
    const { estado } = await ctx.pedir('POST', `/usuarios/${usuarioClienteId}/impersonar`, { token: tokenOperador });
    expect(estado).toBe(403);
  });

  it('el token de impersonación queda limitado al rol cliente', async () => {
    const { estado, cuerpo } = await ctx.pedir('POST', `/usuarios/${usuarioClienteId}/impersonar`, {
      token: tokenAdmin,
    });
    expect(estado).toBe(200);
    expect(cuerpo.usuario.rol).toBe('cliente');
    // Con ese token no se entra a la central
    expect((await ctx.pedir('GET', '/alarmas', { token: cuerpo.token })).estado).toBe(403);
  });

  it('no se puede impersonar a personal de la central', async () => {
    const usuarios = await ctx.pedir('GET', '/usuarios', { token: tokenAdmin });
    const operador = usuarios.cuerpo.find((u: { rol: string }) => u.rol === 'operador');
    const { estado } = await ctx.pedir('POST', `/usuarios/${operador.id}/impersonar`, { token: tokenAdmin });
    expect(estado).toBe(400);
  });

  it('una cuenta de la app no puede ascender a personal', async () => {
    const { estado } = await ctx.pedir('PUT', `/usuarios/${usuarioClienteId}`, {
      token: tokenAdmin,
      cuerpo: { rol: 'admin' },
    });
    expect(estado).toBe(400);
  });

  it('un admin no puede desactivarse a sí mismo', async () => {
    const usuarios = await ctx.pedir('GET', '/usuarios', { token: tokenAdmin });
    const admin = usuarios.cuerpo.find((u: { email: string }) => u.email === 'admin@test.local');
    const { estado } = await ctx.pedir('PUT', `/usuarios/${admin.id}`, {
      token: tokenAdmin,
      cuerpo: { activo: false },
    });
    expect(estado).toBe(400);
  });

  it('un usuario desactivado ya no puede ingresar', async () => {
    const usuarios = await ctx.pedir('GET', '/usuarios', { token: tokenAdmin });
    const operador = usuarios.cuerpo.find((u: { rol: string }) => u.rol === 'operador');
    await ctx.pedir('PUT', `/usuarios/${operador.id}`, { token: tokenAdmin, cuerpo: { activo: false } });
    const { estado } = await ctx.pedir('POST', '/auth/login', {
      cuerpo: { email: 'oper@test.local', clave: 'oper123' },
    });
    expect(estado).toBe(401);
  });
});
