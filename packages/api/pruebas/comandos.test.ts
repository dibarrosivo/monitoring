import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Comandos a los paneles. Lo que se prueba es lo que importa de verdad:
 * que solo pase lo que debe pasar, y que todo quede registrado.
 * El diálogo con la nube del fabricante se sustituye por un proveedor falso.
 */

let ctx: Contexto;
let tokenAdmin: string;
let panelHik: number;
let panelPima: number;

beforeAll(async () => {
  await prepararBaseDePruebas();
  ctx = await crearContexto();
  // Proveedor falso para el tipo hikvision: no sale a internet
  const { registrarProveedor } = await import('@monitoring/engine');
  registrarProveedor('hikvision', () => ({
    nombre: 'falso',
    async enviar({ serial }) {
      return serial === 'FALLA'
        ? { aceptado: false, detalle: 'El proveedor rechazó la orden' }
        : { aceptado: true };
    },
  }));
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
  const clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente K' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Sitio K' } })).cuerpo.id;
  panelHik = (
    await ctx.pedir('POST', '/paneles', {
      token: tokenAdmin,
      cuerpo: { sitioId, numeroCuenta: 'A001', tipo: 'hikvision', serial: 'Q26704958' },
    })
  ).cuerpo.id;
  panelPima = (
    await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'A002', tipo: 'pima' } })
  ).cuerpo.id;
});

describe('qué equipos aceptan comandos', () => {
  it('un Hikvision acepta la orden', async () => {
    const res = await ctx.pedir('POST', `/paneles/${panelHik}/comando`, {
      token: tokenAdmin,
      cuerpo: { accion: 'armar' },
    });
    expect(res.estado).toBe(202);
    expect(res.cuerpo.aceptado).toBe(true);
  });

  it('un PIMA la rechaza: no tiene canal de vuelta', async () => {
    const res = await ctx.pedir('POST', `/paneles/${panelPima}/comando`, {
      token: tokenAdmin,
      cuerpo: { accion: 'desarmar' },
    });
    expect(res.estado).toBe(409);
    expect(res.cuerpo.error).toMatch(/no admite control/i);
  });

  it('sin serial no se puede nombrar el equipo ante el fabricante', async () => {
    const clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'C2' } })).cuerpo.id;
    const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'S2' } })).cuerpo.id;
    const sinSerial = (
      await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'B001', tipo: 'hikvision' } })
    ).cuerpo.id;
    const res = await ctx.pedir('POST', `/paneles/${sinSerial}/comando`, { token: tokenAdmin, cuerpo: { accion: 'armar' } });
    expect(res.estado).toBe(409);
    expect(res.cuerpo.error).toMatch(/serial/i);
  });

  it('una acción inventada se rechaza', async () => {
    const res = await ctx.pedir('POST', `/paneles/${panelHik}/comando`, {
      token: tokenAdmin,
      cuerpo: { accion: 'volar' },
    });
    expect(res.estado).toBe(400);
  });
});

describe('todo comando queda registrado', () => {
  it('el aceptado queda como enviado, con su autor', async () => {
    await ctx.pedir('POST', `/paneles/${panelHik}/comando`, { token: tokenAdmin, cuerpo: { accion: 'armar_casa' } });
    const { cuerpo } = await ctx.pedir('GET', `/paneles/${panelHik}/comandos`, { token: tokenAdmin });
    expect(cuerpo).toHaveLength(1);
    expect(cuerpo[0].accion).toBe('armar_casa');
    expect(cuerpo[0].estado).toBe('enviado');
    expect(cuerpo[0].usuarioId).toBeGreaterThan(0);
  });

  it('el rechazado también queda, con el motivo', async () => {
    // Un comando sin registro es peor que un comando fallido
    const clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'C3' } })).cuerpo.id;
    const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'S3' } })).cuerpo.id;
    const falla = (
      await ctx.pedir('POST', '/paneles', {
        token: tokenAdmin,
        cuerpo: { sitioId, numeroCuenta: 'C001', tipo: 'hikvision', serial: 'FALLA' },
      })
    ).cuerpo.id;

    const res = await ctx.pedir('POST', `/paneles/${falla}/comando`, { token: tokenAdmin, cuerpo: { accion: 'desarmar' } });
    expect(res.estado).toBe(502);

    const { cuerpo } = await ctx.pedir('GET', `/paneles/${falla}/comandos`, { token: tokenAdmin });
    expect(cuerpo[0].estado).toBe('fallido');
    expect(cuerpo[0].detalle).toMatch(/rechazó/i);
  });
});

describe('quién puede mandar comandos', () => {
  it('un usuario de la app sin acceso al equipo no puede', async () => {
    await crearUsuarioDirecto({ email: 'ajeno@test.local', nombre: 'Ajeno', clave: 'clave123', rol: 'cliente' });
    const tokenAjeno = await ctx.ingresar('ajeno@test.local', 'clave123');
    const res = await ctx.pedir('POST', `/paneles/${panelHik}/comando`, {
      token: tokenAjeno,
      cuerpo: { accion: 'desarmar' },
    });
    expect(res.estado).toBe(403);
  });

  it('tampoco puede ver el historial de un equipo ajeno', async () => {
    await crearUsuarioDirecto({ email: 'ajeno2@test.local', nombre: 'Ajeno', clave: 'clave123', rol: 'cliente' });
    const t = await ctx.ingresar('ajeno2@test.local', 'clave123');
    const res = await ctx.pedir('GET', `/paneles/${panelHik}/comandos`, { token: t });
    expect(res.estado).toBe(403);
  });

  it('sin token no se manda nada', async () => {
    const res = await ctx.pedir('POST', `/paneles/${panelHik}/comando`, { cuerpo: { accion: 'desarmar' } });
    expect(res.estado).toBe(401);
  });
});

describe('confirmación por el evento del panel', () => {
  it('el comando se confirma cuando el panel reporta el cierre', async () => {
    // Que el fabricante acepte no prueba que el panel obedeció.
    // La confirmación real llega por la vía de reporte.
    await ctx.pedir('POST', `/paneles/${panelHik}/comando`, { token: tokenAdmin, cuerpo: { accion: 'armar' } });

    const { procesarEvento, registrarSenal } = await import('@monitoring/engine');
    const { interpretarCid } = await import('@monitoring/shared');
    const senalId = await registrarSenal({ fuente: 'simulador', remoto: 'x', cruda: 'x', estadoParse: 'ok' });
    await procesarEvento({
      senalId,
      // 3401 = cierre por usuario, o sea armado
      normalizado: interpretarCid({ numeroCuenta: 'A001', calificador: 3, codigoCid: '401', particion: '01', zona: '001' }),
      recibidaEn: new Date(),
    });

    const { cuerpo } = await ctx.pedir('GET', `/paneles/${panelHik}/comandos`, { token: tokenAdmin });
    expect(cuerpo[0].estado).toBe('confirmado');
    expect(cuerpo[0].resueltoEn).toBeTruthy();
  });

  it('una apertura no confirma un armado', async () => {
    await ctx.pedir('POST', `/paneles/${panelHik}/comando`, { token: tokenAdmin, cuerpo: { accion: 'armar' } });

    const { procesarEvento, registrarSenal } = await import('@monitoring/engine');
    const { interpretarCid } = await import('@monitoring/shared');
    const senalId = await registrarSenal({ fuente: 'simulador', remoto: 'x', cruda: 'x', estadoParse: 'ok' });
    await procesarEvento({
      senalId,
      // 1401 = apertura: es lo contrario de lo que se pidió
      normalizado: interpretarCid({ numeroCuenta: 'A001', calificador: 1, codigoCid: '401', particion: '01', zona: '001' }),
      recibidaEn: new Date(),
    });

    const { cuerpo } = await ctx.pedir('GET', `/paneles/${panelHik}/comandos`, { token: tokenAdmin });
    expect(cuerpo[0].estado).toBe('enviado');
  });
});

describe('los operadores no controlan paneles', () => {
  it('un operador recibe 403 al mandar una orden, aunque el equipo lo admita', async () => {
    const { crearUsuarioDirecto } = await import('./ayuda.js');
    await crearUsuarioDirecto({ email: 'oper2@test.local', nombre: 'Operador Dos', clave: 'oper123', rol: 'operador' });
    const tokenOper = await ctx.ingresar('oper2@test.local', 'oper123');
    const { cuerpo: paneles } = await ctx.pedir('GET', '/paneles', { token: tokenOper });
    const hik = paneles.find((p: { tipo: string }) => p.tipo === 'hikvision');
    const { estado, cuerpo } = await ctx.pedir('POST', `/paneles/${hik.id}/comando`, { token: tokenOper, cuerpo: { accion: 'armar' } });
    expect(estado).toBe(403);
    expect(cuerpo.error).toMatch(/administradores/);
  });
});
