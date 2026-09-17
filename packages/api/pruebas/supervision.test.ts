import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/** Supervisión del personal: lo que hizo cada operador sale de la bitácora y de sus sesiones. */

let ctx: Contexto;
let tokenAdmin: string;
let tokenOperador: string;
let panelId: number;

async function dispararAlarma(prioridad = 2): Promise<number> {
  const { abrirAlarma } = await import('@monitoring/engine');
  const { db, evento } = await import('@monitoring/db');
  const [filaEvento] = await db
    .insert(evento)
    .values({ panelId, numeroCuenta: 'SUP1', categoria: 'alarma', codigo: 'E130', descripcion: 'Robo', zona: '001', prioridad, ocurridoEn: new Date() })
    .returning({ id: evento.id });
  return abrirAlarma({ eventoId: filaEvento!.id, panelId, prioridad, descripcion: 'Robo' });
}

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
  await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Operador Uno', clave: 'oper123', rol: 'operador' });
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');
  tokenOperador = await ctx.ingresar('oper@test.local', 'oper123');
  const clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente S' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Sitio S' } })).cuerpo.id;
  panelId = (await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'SUP1' } })).cuerpo.id;
});

describe('supervisión del personal', () => {
  it('solo los administradores pueden verla', async () => {
    const { estado } = await ctx.pedir('GET', '/supervision', { token: tokenOperador });
    expect(estado).toBe(403);
  });

  it('el ingreso deja una sesión y el operador figura en servicio', async () => {
    const { cuerpo } = await ctx.pedir('GET', '/supervision', { token: tokenAdmin });
    const oper = cuerpo.operadores.find((o: { email: string }) => o.email === 'oper@test.local');
    expect(oper.sesiones).toBe(1);
    expect(oper.enServicio).toBe(true);
    expect(oper.ultimaActividadEn).toBeTruthy();
  });

  it('cuenta lo que hizo cada uno: tomas, llamadas, notas, cierres y desenlaces', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    await ctx.pedir('POST', `/alarmas/${id}/llamada`, { token: tokenOperador, cuerpo: { nombre: 'Juan', telefono: '1', resultado: 'atendio_ok' } });
    await ctx.pedir('POST', `/alarmas/${id}/notas`, { token: tokenOperador, cuerpo: { detalle: 'Todo en orden' } });
    await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenOperador, cuerpo: { desenlace: 'falsa_alarma', motivo: 'mascota_objeto' } });

    const { cuerpo } = await ctx.pedir('GET', '/supervision', { token: tokenAdmin });
    const oper = cuerpo.operadores.find((o: { email: string }) => o.email === 'oper@test.local');
    expect(oper).toMatchObject({ tomadas: 1, cerradas: 1, llamadas: 1, notas: 1, hombreMuerto: 0 });
    expect(oper.desenlaces).toEqual({ resuelta: 0, falsa_alarma: 1, escalada: 0 });
    expect(oper.motivos).toEqual([{ desenlace: 'falsa_alarma', motivo: 'mascota_objeto', n: 1 }]);
    expect(oper.reaccionMediaSeg).toBeGreaterThanOrEqual(0);
    expect(oper.atencionMediaSeg).toBeGreaterThanOrEqual(0);
    const admin = cuerpo.operadores.find((o: { email: string }) => o.email === 'admin@test.local');
    expect(admin.tomadas).toBe(0);
  });

  it('señala un cierre de alarma real sin ninguna llamada registrada', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenOperador, cuerpo: { desenlace: 'resuelta', motivo: 'cliente_desarmo' } });
    const { cuerpo } = await ctx.pedir('GET', '/supervision', { token: tokenAdmin });
    const alerta = cuerpo.alertas.find((a: { tipo: string }) => a.tipo === 'cierre_sin_llamada');
    expect(alerta.texto).toContain('Operador Uno');
  });

  it('la línea de tiempo de un operador trae sus acciones e ingresos', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    const { cuerpo: sup } = await ctx.pedir('GET', '/supervision', { token: tokenAdmin });
    const oper = sup.operadores.find((o: { email: string }) => o.email === 'oper@test.local');
    const { cuerpo } = await ctx.pedir('GET', `/supervision/operadores/${oper.id}/actividad`, { token: tokenAdmin });
    expect(cuerpo.operador.nombre).toBe('Operador Uno');
    expect(cuerpo.acciones).toHaveLength(1);
    expect(cuerpo.acciones[0]).toMatchObject({ tipo: 'toma', codigo: 'E130', numeroCuenta: 'SUP1' });
    expect(cuerpo.sesiones).toHaveLength(1);
  });

  it('el hombre muerto sin confirmar se atribuye a quien no confirmó', async () => {
    await ctx.pedir('POST', '/vigilancia/hombre-muerto', { token: tokenOperador });
    const { cuerpo } = await ctx.pedir('GET', '/supervision', { token: tokenAdmin });
    const oper = cuerpo.operadores.find((o: { email: string }) => o.email === 'oper@test.local');
    expect(oper.hombreMuerto).toBe(1);
  });
});
