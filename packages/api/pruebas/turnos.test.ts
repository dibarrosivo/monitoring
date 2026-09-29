import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/** Turnos de la central: la pauta semanal, las guardias por fecha y quién queda de guardia. */

let ctx: Contexto;
let tokenAdmin: string;
let tokenOperador: string;
let operadorId: number;
let supervisorId: number;

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
  operadorId = await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Operador Uno', clave: 'oper123', rol: 'operador' });
  supervisorId = await crearUsuarioDirecto({ email: 'sup@test.local', nombre: 'Supervisor', clave: 'sup12345', rol: 'supervisor' });
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');
  tokenOperador = await ctx.ingresar('oper@test.local', 'oper123');
});

describe('turnos', () => {
  it('una sola pauta rige aunque no se active; el operador puede mirar pero no editar', async () => {
    const pauta = (await ctx.pedir('POST', '/turnos/pautas', { token: tokenAdmin, cuerpo: { nombre: 'Semana A' } })).cuerpo;
    expect(pauta.activa).toBe(false);
    const vista = (await ctx.pedir('GET', '/turnos', { token: tokenOperador })).cuerpo;
    expect(vista.vigente).toBe(pauta.id);
    expect((await ctx.pedir('POST', '/turnos/pautas', { token: tokenOperador, cuerpo: { nombre: 'Semana B' } })).estado).toBe(403);
  });

  it('con dos pautas manda la activa, y activar una apaga la otra', async () => {
    const a = (await ctx.pedir('POST', '/turnos/pautas', { token: tokenAdmin, cuerpo: { nombre: 'Semana A' } })).cuerpo;
    const b = (await ctx.pedir('POST', '/turnos/pautas', { token: tokenAdmin, cuerpo: { nombre: 'Semana B' } })).cuerpo;
    expect((await ctx.pedir('GET', '/turnos', { token: tokenAdmin })).cuerpo.vigente).toBeNull();
    await ctx.pedir('POST', `/turnos/pautas/${a.id}/activar`, { token: tokenAdmin });
    expect((await ctx.pedir('GET', '/turnos', { token: tokenAdmin })).cuerpo.vigente).toBe(a.id);
    await ctx.pedir('POST', `/turnos/pautas/${b.id}/activar`, { token: tokenAdmin });
    const vista = (await ctx.pedir('GET', '/turnos', { token: tokenAdmin })).cuerpo;
    expect(vista.vigente).toBe(b.id);
    expect(vista.pautas.filter((p: { activa: boolean }) => p.activa)).toHaveLength(1);
  });

  it('un turno de todos los días y todo el día deja a esa persona de guardia ahora', async () => {
    const pauta = (await ctx.pedir('POST', '/turnos/pautas', { token: tokenAdmin, cuerpo: { nombre: 'Única' } })).cuerpo;
    await ctx.pedir('POST', '/turnos/tramos', { token: tokenAdmin, cuerpo: { pautaId: pauta.id, usuarioId: operadorId, dias: 'LMXJVSD', desde: '00:00', hasta: '23:59' } });
    expect((await ctx.pedir('GET', '/turnos', { token: tokenAdmin })).cuerpo.deGuardiaAhora).toEqual([operadorId]);
  });

  it('una guardia por fecha reemplaza a la pauta ese día', async () => {
    const pauta = (await ctx.pedir('POST', '/turnos/pautas', { token: tokenAdmin, cuerpo: { nombre: 'Única' } })).cuerpo;
    await ctx.pedir('POST', '/turnos/tramos', { token: tokenAdmin, cuerpo: { pautaId: pauta.id, usuarioId: operadorId, dias: 'LMXJVSD', desde: '00:00', hasta: '23:59' } });
    const hoy = new Date().toISOString().slice(0, 10);
    await ctx.pedir('POST', '/turnos/guardias', { token: tokenAdmin, cuerpo: { usuarioId: supervisorId, fecha: hoy, desde: '00:00', hasta: '23:59', nota: 'cambio' } });
    expect((await ctx.pedir('GET', '/turnos', { token: tokenAdmin })).cuerpo.deGuardiaAhora).toEqual([supervisorId]);
  });

  it('sin turnos no hay nadie de guardia, y eso es lo que hace que se avise a todos', async () => {
    expect((await ctx.pedir('GET', '/turnos', { token: tokenAdmin })).cuerpo.deGuardiaAhora).toEqual([]);
  });

  it('rechaza días y horas mal formados', async () => {
    const pauta = (await ctx.pedir('POST', '/turnos/pautas', { token: tokenAdmin, cuerpo: { nombre: 'Única' } })).cuerpo;
    expect((await ctx.pedir('POST', '/turnos/tramos', { token: tokenAdmin, cuerpo: { pautaId: pauta.id, usuarioId: operadorId, dias: 'LUNES', desde: '07:00', hasta: '19:00' } })).estado).toBe(400);
    expect((await ctx.pedir('POST', '/turnos/tramos', { token: tokenAdmin, cuerpo: { pautaId: pauta.id, usuarioId: operadorId, dias: 'LMXJV--', desde: '7am', hasta: '19:00' } })).estado).toBe(400);
  });
});
