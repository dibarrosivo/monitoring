import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/** Flujo completo del operador sobre una alarma, y el reporte que lo respalda. */

let ctx: Contexto;
let tokenAdmin: string;
let tokenOperador: string;
let clienteId: number;
let panelId: number;

/** Crea un evento con su alarma como lo haría el receptor. */
async function dispararAlarma(codigo = 'E130', prioridad = 2): Promise<number> {
  const { abrirAlarma } = await import('@monitoring/engine');
  const { db, evento } = await import('@monitoring/db');
  const [filaEvento] = await db
    .insert(evento)
    .values({
      panelId,
      numeroCuenta: 'CCC1',
      categoria: 'alarma',
      codigo,
      descripcion: 'Robo de prueba',
      zona: '015',
      prioridad,
      ocurridoEn: new Date(),
    })
    .returning({ id: evento.id });
  return abrirAlarma({ eventoId: filaEvento!.id, panelId, prioridad, descripcion: 'Robo de prueba' });
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

  clienteId = (
    await ctx.pedir('POST', '/clientes', {
      token: tokenAdmin,
      cuerpo: { nombre: 'Cliente C', instrucciones: 'Llamar al sitio y pedir palabra clave.' },
    })
  ).cuerpo.id;
  const sitioId = (
    await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Sitio C' } })
  ).cuerpo.id;
  panelId = (
    await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: 'CCC1' } })
  ).cuerpo.id;
});

describe('cola de alarmas', () => {
  it('la alarma nueva aparece con el cliente y la descripción de zona', async () => {
    await ctx.pedir('POST', '/zonas', {
      token: tokenAdmin,
      cuerpo: { panelId, numero: '015', descripcion: 'Puerta principal' },
    });
    await dispararAlarma();

    const { cuerpo } = await ctx.pedir('GET', '/alarmas', { token: tokenOperador });
    expect(cuerpo).toHaveLength(1);
    expect(cuerpo[0].estado).toBe('nueva');
    expect(cuerpo[0].clienteNombre).toBe('Cliente C');
    expect(cuerpo[0].zonaDescripcion).toBe('Puerta principal');
  });

  it('filtra por estado', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    await dispararAlarma();

    const nuevas = await ctx.pedir('GET', '/alarmas?estado=nueva', { token: tokenOperador });
    const enAtencion = await ctx.pedir('GET', '/alarmas?estado=en_atencion', { token: tokenOperador });
    expect(nuevas.cuerpo).toHaveLength(1);
    expect(enAtencion.cuerpo).toHaveLength(1);
  });

  it('el contexto trae el plan de acción y la lista de llamadas', async () => {
    await ctx.pedir('POST', '/contactos', {
      token: tokenAdmin,
      cuerpo: { clienteId, nombre: 'Encargado', telefono: '+1111', orden: 1, palabraClave: 'girasol' },
    });
    const id = await dispararAlarma();

    const { cuerpo } = await ctx.pedir('GET', `/alarmas/${id}/contexto`, { token: tokenOperador });
    expect(cuerpo.cliente.instrucciones).toContain('palabra clave');
    expect(cuerpo.contactos[0].nombre).toBe('Encargado');
    expect(cuerpo.contactos[0].palabraClave).toBe('girasol');
  });
});

describe('atención de una alarma', () => {
  it('tomar la asigna al operador y queda en el historial', async () => {
    const id = await dispararAlarma();
    const { estado, cuerpo } = await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    expect(estado).toBe(200);
    expect(cuerpo.estado).toBe('en_atencion');
    expect(cuerpo.tomadaEn).not.toBeNull();

    const acciones = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenOperador });
    expect(acciones.cuerpo.map((a: { tipo: string }) => a.tipo)).toEqual(['toma']);
  });

  it('las notas quedan registradas con su autor', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    await ctx.pedir('POST', `/alarmas/${id}/notas`, {
      token: tokenOperador,
      cuerpo: { detalle: 'Se llamó al contacto 1, no responde' },
    });

    const { cuerpo } = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenOperador });
    const nota = cuerpo.find((a: { tipo: string }) => a.tipo === 'nota');
    expect(nota.detalle).toContain('no responde');
    expect(nota.operadorId).not.toBeNull();
  });

  it('cerrar exige resolución y saca la alarma de la cola abierta', async () => {
    const id = await dispararAlarma();
    const sinResolucion = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenOperador, cuerpo: {} });
    expect(sinResolucion.estado).toBe(400);

    const cerrada = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, {
      token: tokenOperador,
      cuerpo: { resolucion: 'Falsa alarma verificada con el encargado' },
    });
    expect(cerrada.estado).toBe(200);
    expect(cerrada.cuerpo.estado).toBe('cerrada');

    const abiertas = await ctx.pedir('GET', '/alarmas', { token: tokenOperador });
    expect(abiertas.cuerpo).toHaveLength(0);
    const cerradas = await ctx.pedir('GET', '/alarmas?estado=cerrada', { token: tokenOperador });
    expect(cerradas.cuerpo).toHaveLength(1);
  });

  it('responde 404 al tomar una alarma inexistente', async () => {
    const { estado } = await ctx.pedir('POST', '/alarmas/99999/tomar', { token: tokenOperador });
    expect(estado).toBe(404);
  });
});

describe('tablero y reportes', () => {
  it('el tablero cuenta las alarmas por estado', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    await dispararAlarma();

    const { cuerpo } = await ctx.pedir('GET', '/tablero', { token: tokenAdmin });
    expect(cuerpo.alarmas.nuevas).toBe(1);
    expect(cuerpo.alarmas.enAtencion).toBe(1);
    expect(cuerpo.paneles.activos).toBe(1);
  });

  it('el reporte del período incluye la alarma y su tiempo de respuesta', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenOperador, cuerpo: { resolucion: 'Verificado' } });

    const desde = new Date(Date.now() - 3600_000).toISOString();
    const hasta = new Date(Date.now() + 3600_000).toISOString();
    const { estado, cuerpo } = await ctx.pedir(
      'GET',
      `/reportes?clienteId=${clienteId}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
      { token: tokenAdmin },
    );
    expect(estado).toBe(200);
    expect(cuerpo.estadisticas.totalAlarmas).toBe(1);
    expect(cuerpo.alarmas[0].resolucion).toBe('Verificado');
    expect(cuerpo.estadisticas.respuestaMediaSeg).not.toBeNull();
  });

  it('el reporte exige cliente y período', async () => {
    const { estado } = await ctx.pedir('GET', '/reportes', { token: tokenAdmin });
    expect(estado).toBe(400);
  });
});

describe('diario de señales', () => {
  it('expone las señales crudas y una puntual por id', async () => {
    const { registrarSenal } = await import('@monitoring/engine');
    const senalId = await registrarSenal({
      fuente: 'dc09-tcp',
      remoto: '127.0.0.1:1234',
      cruda: '"ADM-CID"0001R0L0#CCC1[#CCC1|1130 01 015]',
      estadoParse: 'ok',
    });

    const listado = await ctx.pedir('GET', '/senales?limite=10', { token: tokenOperador });
    expect(listado.cuerpo.length).toBeGreaterThan(0);

    const puntual = await ctx.pedir('GET', `/senales/${senalId}`, { token: tokenOperador });
    expect(puntual.estado).toBe(200);
    expect(puntual.cuerpo.cruda).toContain('ADM-CID');
  });
});
