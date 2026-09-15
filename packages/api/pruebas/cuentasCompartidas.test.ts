import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Dos clientes pueden compartir número de cuenta si transmiten por vías
 * distintas. Pasa de verdad en la central: la 7037 es un panel Hikvision de
 * prueba (por DC-09) y también el transmisor EBS de un cliente real (por el
 * receptor OSM). El sistema anterior los separa por el receptor que los trae;
 * acá lo hace la vía de entrada.
 */

let ctx: Contexto;
let token: string;
let idHik: number;
let idEbs: number;

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
  token = await ctx.ingresar('admin@test.local', 'admin123');

  const falcon = (await ctx.pedir('POST', '/clientes', { token, cuerpo: { nombre: 'Falcon (prueba)' } })).cuerpo.id;
  const sitioFalcon = (await ctx.pedir('POST', '/sitios', { token, cuerpo: { clienteId: falcon, nombre: 'Oficina' } })).cuerpo.id;
  idHik = (await ctx.pedir('POST', '/paneles', { token, cuerpo: { sitioId: sitioFalcon, numeroCuenta: '7037', tipo: 'hikvision' } })).cuerpo.id;

  const matarile = (await ctx.pedir('POST', '/clientes', { token, cuerpo: { nombre: 'Matarile' } })).cuerpo.id;
  const sitioMatarile = (await ctx.pedir('POST', '/sitios', { token, cuerpo: { clienteId: matarile, nombre: 'Local' } })).cuerpo.id;
  const alta = await ctx.pedir('POST', '/paneles', { token, cuerpo: { sitioId: sitioMatarile, numeroCuenta: '7037', tipo: 'ebm' } });
  idEbs = alta.cuerpo.id;
});

describe('alta de equipos con el mismo número', () => {
  it('se admite entre tipos distintos', () => {
    expect(idHik).toBeGreaterThan(0);
    expect(idEbs).toBeGreaterThan(0);
    expect(idEbs).not.toBe(idHik);
  });

  it('se rechaza dentro del mismo tipo', async () => {
    const otro = (await ctx.pedir('POST', '/clientes', { token, cuerpo: { nombre: 'Tercero' } })).cuerpo.id;
    const sitio = (await ctx.pedir('POST', '/sitios', { token, cuerpo: { clienteId: otro, nombre: 'Local' } })).cuerpo.id;
    const { estado, cuerpo } = await ctx.pedir('POST', '/paneles', { token, cuerpo: { sitioId: sitio, numeroCuenta: '7037', tipo: 'ebm' } });
    expect(estado).toBe(409);
    expect(cuerpo.error).toMatch(/EBS/);
  });

  it('al editar, cambiar el tipo al de otro equipo con el mismo número también se rechaza', async () => {
    const { estado } = await ctx.pedir('PUT', `/paneles/${idEbs}`, { token, cuerpo: { tipo: 'hikvision' } });
    expect(estado).toBe(409);
  });
});

describe('a quién se le adjudica una señal', () => {
  async function procesar(fuente: 'dc09-tcp' | 'surgard-tcp' | 'pima-bridge' | undefined) {
    const { procesarEvento, registrarSenal } = await import('@monitoring/engine');
    const { interpretarCid } = await import('@monitoring/shared');
    const senalId = await registrarSenal({ fuente: fuente ?? 'simulador', remoto: 'prueba', cruda: 'x', estadoParse: 'ok' });
    return procesarEvento({
      senalId,
      normalizado: interpretarCid({ numeroCuenta: '7037', calificador: 1, codigoCid: '130', particion: '01', zona: '004' }),
      recibidaEn: new Date(),
      fuente,
    });
  }

  it('por el receptor EBS va al transmisor EBS', async () => {
    expect((await procesar('surgard-tcp')).panelId).toBe(idEbs);
  });

  it('por DC-09 va al panel Hikvision', async () => {
    expect((await procesar('dc09-tcp')).panelId).toBe(idHik);
  });

  it('sin vía que desempate, entra como cuenta desconocida antes que al cliente equivocado', async () => {
    const r = await procesar(undefined);
    expect(r.panelId).toBeUndefined();
    const alarmas = await ctx.pedir('GET', '/alarmas', { token });
    expect(alarmas.cuerpo.some((a: { evento: { descripcion: string } }) => a.evento.descripcion.includes('CUENTA DESCONOCIDA'))).toBe(true);
  });

  it('con un solo equipo con ese número, la vía no importa', async () => {
    await ctx.pedir('DELETE', `/paneles/${idEbs}`, { token }).catch(() => null);
    const { db, panel } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    await db.delete(panel).where(eq(panel.id, idEbs));
    expect((await procesar('surgard-tcp')).panelId).toBe(idHik);
  });
});
