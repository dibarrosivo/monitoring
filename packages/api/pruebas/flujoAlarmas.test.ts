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

describe('desenlace y protocolo', () => {
  it('el cierre distingue una falsa alarma de una resuelta', async () => {
    const alarmaId = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${alarmaId}/tomar`, { token: tokenOperador });
    const res = await ctx.pedir('POST', `/alarmas/${alarmaId}/cerrar`, {
      token: tokenOperador,
      cuerpo: { resolucion: 'El cliente confirmó que disparó sin querer', desenlace: 'falsa_alarma' },
    });
    expect(res.estado).toBe(200);
    expect(res.cuerpo.desenlace).toBe('falsa_alarma');

    // Queda en la bitácora con su etiqueta, no solo en el campo
    const acciones = await ctx.pedir('GET', `/alarmas/${alarmaId}/acciones`, { token: tokenOperador });
    const cierre = acciones.cuerpo.find((a: { tipo: string }) => a.tipo === 'cierre');
    expect(cierre.detalle).toMatch(/Falsa alarma/);
  });

  it('sin desenlace explícito se asume resuelta', async () => {
    const alarmaId = await dispararAlarma();
    const res = await ctx.pedir('POST', `/alarmas/${alarmaId}/cerrar`, {
      token: tokenOperador,
      cuerpo: { resolucion: 'Verificado con el cliente' },
    });
    expect(res.cuerpo.desenlace).toBe('resuelta');
  });

  it('el contexto trae el protocolo del tipo de evento', async () => {
    const alarmaId = await dispararAlarma('E130');
    const res = await ctx.pedir('GET', `/alarmas/${alarmaId}/contexto`, { token: tokenOperador });
    expect(res.cuerpo.pasos.length).toBeGreaterThan(0);
    expect(res.cuerpo.pasos.join(' ')).toMatch(/palabra clave/i);
    expect(res.cuerpo.pasosCumplidos).toEqual([]);
  });

  it('marcar un paso lo refleja en el contexto y en la bitácora', async () => {
    const alarmaId = await dispararAlarma('E130');
    const { cuerpo: antes } = await ctx.pedir('GET', `/alarmas/${alarmaId}/contexto`, { token: tokenOperador });
    const paso = antes.pasos[0];

    await ctx.pedir('POST', `/alarmas/${alarmaId}/paso`, { token: tokenOperador, cuerpo: { paso } });

    const { cuerpo: despues } = await ctx.pedir('GET', `/alarmas/${alarmaId}/contexto`, { token: tokenOperador });
    expect(despues.pasosCumplidos).toContain(paso);

    // Lo cumplido se deduce de la bitácora: no hay un estado aparte que pueda contradecirla
    const acciones = await ctx.pedir('GET', `/alarmas/${alarmaId}/acciones`, { token: tokenOperador });
    expect(acciones.cuerpo.some((a: { tipo: string; detalle: string }) => a.tipo === 'paso' && a.detalle === paso)).toBe(true);
  });

  it('una prueba periódica no abre alarma', async () => {
    // El catálogo la excluye: si abriera, cada equipo inundaría la cola con
    // una alarma por prueba, varias veces al día y por cuenta.
    const { procesarEvento, registrarSenal } = await import('@monitoring/engine');
    const { interpretarCid } = await import('@monitoring/shared');

    const antes = (await ctx.pedir('GET', '/alarmas', { token: tokenOperador })).cuerpo.length;
    const senalId = await registrarSenal({
      fuente: 'simulador',
      remoto: 'prueba',
      cruda: '5011CCC118160200000',
      estadoParse: 'ok',
    });
    const resultado = await procesarEvento({
      senalId,
      normalizado: interpretarCid({ numeroCuenta: 'CCC1', calificador: 1, codigoCid: '602', particion: '01', zona: '000' }),
      recibidaEn: new Date(),
    });

    // El evento se registra igual: lo que no ocurre es la alarma
    expect(resultado.eventoId).toBeGreaterThan(0);
    expect(resultado.alarmaId).toBeUndefined();
    const despues = (await ctx.pedir('GET', '/alarmas', { token: tokenOperador })).cuerpo.length;
    expect(despues).toBe(antes);
  });

  it('en cambio un robo sí abre alarma', async () => {
    // Contraste deliberado: confirma que el caso anterior no pasa porque el
    // motor esté roto, sino porque el catálogo excluye ese código.
    const { procesarEvento, registrarSenal } = await import('@monitoring/engine');
    const { interpretarCid } = await import('@monitoring/shared');
    const senalId = await registrarSenal({ fuente: 'simulador', remoto: 'prueba', cruda: 'x', estadoParse: 'ok' });
    const resultado = await procesarEvento({
      senalId,
      normalizado: interpretarCid({ numeroCuenta: 'CCC1', calificador: 1, codigoCid: '130', particion: '01', zona: '015' }),
      recibidaEn: new Date(),
    });
    expect(resultado.alarmaId).toBeGreaterThan(0);
  });
});

describe('varios operadores sobre la misma alarma', () => {
  it('la cola dice quién tiene cada alarma', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    const { cuerpo } = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(cuerpo[0]).toMatchObject({ estado: 'en_atencion', operadorNombre: 'Operador Uno' });
  });

  it('no se puede tomar una alarma que otro ya tiene', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    const { estado, cuerpo } = await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenAdmin });
    expect(estado).toBe(409);
    expect(cuerpo.error).toContain('Operador Uno');
  });

  it('volver a tomar la propia no falla ni duplica la bitácora', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    const { estado } = await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    expect(estado).toBe(200);
    const acciones = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenOperador });
    expect(acciones.cuerpo.filter((a: { tipo: string }) => a.tipo === 'toma')).toHaveLength(1);
    expect(acciones.cuerpo[0]).toMatchObject({ operadorNombre: 'Operador Uno' });
    expect(acciones.cuerpo[0].detalle).toMatch(/Tomada tras/);
  });

  it('devolver a la cola la deja nueva y otro puede tomarla', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    const devuelta = await ctx.pedir('POST', `/alarmas/${id}/devolver`, { token: tokenOperador, cuerpo: { motivo: 'cambio de turno' } });
    expect(devuelta.cuerpo).toMatchObject({ estado: 'nueva', operadorId: null, tomadaEn: null });
    const { estado } = await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenAdmin });
    expect(estado).toBe(200);
    const acciones = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenAdmin });
    expect(acciones.cuerpo.some((a: { detalle: string | null }) => a.detalle?.includes('Devuelta a la cola: cambio de turno'))).toBe(true);
  });

  it('solo se devuelve una alarma en atención', async () => {
    const id = await dispararAlarma();
    const { estado } = await ctx.pedir('POST', `/alarmas/${id}/devolver`, { token: tokenOperador, cuerpo: {} });
    expect(estado).toBe(409);
  });
});

describe('cierre guiado', () => {
  it('el motivo queda como dato y en la bitácora con los tiempos', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    const { estado, cuerpo } = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, {
      token: tokenOperador,
      cuerpo: { desenlace: 'falsa_alarma', motivo: 'mascota_objeto' },
    });
    expect(estado).toBe(200);
    expect(cuerpo).toMatchObject({ estado: 'cerrada', desenlace: 'falsa_alarma', motivo: 'mascota_objeto' });
    expect(cuerpo.resolucion).toBe('Mascota u objeto en movimiento');
    const acciones = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenOperador });
    const cierre = acciones.cuerpo.find((a: { tipo: string }) => a.tipo === 'cierre');
    expect(cierre.detalle).toMatch(/^Falsa alarma tras .* en atención: Mascota u objeto en movimiento$/);
    const cerradas = await ctx.pedir('GET', '/alarmas?estado=cerrada', { token: tokenOperador });
    expect(cerradas.cuerpo[0]).toMatchObject({ motivo: 'mascota_objeto', desenlace: 'falsa_alarma', operadorNombre: 'Operador Uno' });
  });

  it('"otro" exige detalle, y un motivo ajeno al desenlace se rechaza', async () => {
    const id = await dispararAlarma();
    const sinTexto = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenOperador, cuerpo: { desenlace: 'resuelta', motivo: 'otro' } });
    expect(sinTexto.estado).toBe(400);
    const ajeno = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenOperador, cuerpo: { desenlace: 'resuelta', motivo: 'mascota_objeto' } });
    expect(ajeno.estado).toBe(400);
    const bien = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenOperador, cuerpo: { desenlace: 'resuelta', motivo: 'otro', resolucion: 'Se coordinó con el vecino' } });
    expect(bien.estado).toBe(200);
    expect(bien.cuerpo.resolucion).toBe('Otro (detallar) — Se coordinó con el vecino');
  });

  it('cerrar sin haber tomado la asigna a quien cierra y lo dice en la bitácora', async () => {
    const id = await dispararAlarma();
    const { cuerpo } = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenAdmin, cuerpo: { desenlace: 'resuelta', motivo: 'cliente_desarmo' } });
    expect(cuerpo.tomadaEn).toBeTruthy();
    const acciones = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenAdmin });
    expect(acciones.cuerpo.at(-1).detalle).toMatch(/sin haberse tomado/);
  });

  it('una alarma cerrada no se cierra dos veces', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenAdmin, cuerpo: { desenlace: 'resuelta', motivo: 'cliente_desarmo' } });
    const { estado } = await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenAdmin, cuerpo: { desenlace: 'resuelta', motivo: 'cliente_desarmo' } });
    expect(estado).toBe(409);
  });
});

describe('registro de llamadas', () => {
  it('una llamada queda en la bitácora con su resultado', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    const { estado, cuerpo } = await ctx.pedir('POST', `/alarmas/${id}/llamada`, {
      token: tokenOperador,
      cuerpo: { nombre: 'Juan', telefono: '0414-1234567', resultado: 'no_atendio' },
    });
    expect(estado).toBe(201);
    expect(cuerpo).toMatchObject({ tipo: 'llamada', detalle: 'Llamada a Juan (0414-1234567): No atendió' });
  });

  it('una palabra clave incorrecta sube la alarma a prioridad máxima y avisa de coacción', async () => {
    const id = await dispararAlarma('E130', 2);
    await ctx.pedir('POST', `/alarmas/${id}/tomar`, { token: tokenOperador });
    await ctx.pedir('POST', `/alarmas/${id}/llamada`, {
      token: tokenOperador,
      cuerpo: { nombre: 'Juan', telefono: '0414-1234567', resultado: 'clave_incorrecta' },
    });
    const { cuerpo } = await ctx.pedir('GET', '/alarmas', { token: tokenOperador });
    expect(cuerpo.find((a: { id: number }) => a.id === id).prioridad).toBe(1);
    const acciones = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenOperador });
    const aviso = acciones.cuerpo.find((a: { tipo: string; detalle: string }) => a.tipo === 'sistema' && a.detalle.startsWith('POSIBLE COACCIÓN'));
    expect(aviso).toBeTruthy();
    expect(aviso.operadorNombre).toBeNull();
  });

  it('un resultado inventado se rechaza', async () => {
    const id = await dispararAlarma();
    const { estado } = await ctx.pedir('POST', `/alarmas/${id}/llamada`, { token: tokenOperador, cuerpo: { nombre: 'Juan', telefono: '1', resultado: 'colgo' } });
    expect(estado).toBe(400);
  });
});

describe('correlación con lo que reporta el panel', () => {
  async function llegaEvento(codigoCid: string, calificador: 1 | 3, zona: string, categoria?: string) {
    const { procesarEvento, registrarSenal } = await import('@monitoring/engine');
    const { interpretarCid } = await import('@monitoring/shared');
    const senalId = await registrarSenal({ fuente: 'simulador', remoto: 'prueba', cruda: 'x', estadoParse: 'ok' });
    return procesarEvento({
      senalId,
      normalizado: interpretarCid({ numeroCuenta: 'CCC1', calificador, codigoCid, particion: '01', zona }),
      recibidaEn: new Date(),
      fuente: 'simulador',
    });
  }

  it('la restauración del mismo código y zona marca la alarma como restaurada, sin cerrarla', async () => {
    const id = await dispararAlarma('E130', 2); // zona 015
    await llegaEvento('130', 3, '015');
    const { cuerpo } = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    const a = cuerpo.find((x: { id: number }) => x.id === id);
    expect(a.estado).toBe('nueva');
    expect(a.restauradaEn).toBeTruthy();
    const acciones = await ctx.pedir('GET', `/alarmas/${id}/acciones`, { token: tokenAdmin });
    expect(acciones.cuerpo.some((x: { detalle: string | null }) => x.detalle?.startsWith('Restaurado por el panel: R130'))).toBe(true);
  });

  it('la restauración de otra zona no la marca', async () => {
    const id = await dispararAlarma('E130', 2);
    await llegaEvento('130', 3, '007');
    const { cuerpo } = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(cuerpo.find((x: { id: number }) => x.id === id).restauradaEn).toBeNull();
  });

  it('un panel silencioso que vuelve a reportar marca su alarma como restaurada', async () => {
    const { db, panel, evento: tEvento } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    const { abrirAlarma } = await import('@monitoring/engine');
    const [e] = await db
      .insert(tEvento)
      .values({ panelId, numeroCuenta: 'CCC1', categoria: 'sistema', codigo: 'SIS', descripcion: 'Panel silencioso', prioridad: 3, ocurridoEn: new Date() })
      .returning({ id: tEvento.id });
    const id = await abrirAlarma({ eventoId: e!.id, panelId, prioridad: 3, descripcion: 'Panel silencioso', numeroCuenta: 'CCC1' });
    await llegaEvento('602', 1, '000');
    const { cuerpo } = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(cuerpo.find((x: { id: number }) => x.id === id).restauradaEn).toBeTruthy();
    void panel; void eq;
  });
});

describe('lotes y reapertura', () => {
  it('tomar en lote asigna todas las nuevas y omite las que no lo están', async () => {
    const a = await dispararAlarma();
    const b = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${b}/tomar`, { token: tokenAdmin });
    const { cuerpo } = await ctx.pedir('POST', '/alarmas/lote/tomar', { token: tokenOperador, cuerpo: { ids: [a, b] } });
    expect(cuerpo).toEqual({ tomadas: 1, omitidas: 1 });
    const cola = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(cola.cuerpo.find((x: { id: number }) => x.id === a).operadorNombre).toBe('Operador Uno');
  });

  it('cerrar en lote cierra todas con el mismo motivo y deja bitácora en cada una', async () => {
    const a = await dispararAlarma();
    const b = await dispararAlarma();
    const { estado, cuerpo } = await ctx.pedir('POST', '/alarmas/lote/cerrar', {
      token: tokenOperador,
      cuerpo: { ids: [a, b], desenlace: 'falsa_alarma', motivo: 'falla_equipo' },
    });
    expect(estado).toBe(200);
    expect(cuerpo).toEqual({ cerradas: 2, omitidas: 0 });
    const acciones = await ctx.pedir('GET', `/alarmas/${b}/acciones`, { token: tokenAdmin });
    expect(acciones.cuerpo.at(-1).detalle).toMatch(/en lote de 2: Falla del equipo/);
    expect((await ctx.pedir('GET', '/alarmas', { token: tokenAdmin })).cuerpo).toHaveLength(0);
  });

  it('cerrar en lote exige motivo o resolución', async () => {
    const a = await dispararAlarma();
    const { estado } = await ctx.pedir('POST', '/alarmas/lote/cerrar', { token: tokenOperador, cuerpo: { ids: [a], desenlace: 'resuelta' } });
    expect(estado).toBe(400);
  });

  it('una alarma cerrada por error se reabre y vuelve a atención de quien la reabre', async () => {
    const id = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${id}/cerrar`, { token: tokenAdmin, cuerpo: { desenlace: 'resuelta', motivo: 'cliente_desarmo' } });
    const { estado, cuerpo } = await ctx.pedir('POST', `/alarmas/${id}/reabrir`, { token: tokenOperador });
    expect(estado).toBe(200);
    expect(cuerpo).toMatchObject({ estado: 'en_atencion', desenlace: null, motivo: null });
    const cola = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(cola.cuerpo.find((x: { id: number }) => x.id === id).operadorNombre).toBe('Operador Uno');
    expect((await ctx.pedir('POST', `/alarmas/${id}/reabrir`, { token: tokenOperador })).estado).toBe(409);
  });
});

describe('contexto ampliado', () => {
  it('trae horarios, usuarios del panel y las últimas alarmas cerradas del sitio', async () => {
    await ctx.pedir('POST', '/horarios', { token: tokenAdmin, cuerpo: { panelId, dias: 'LMXJV--', apertura: '08:00', cierre: '18:00' } });
    await ctx.pedir('POST', '/usuarios-panel', { token: tokenAdmin, cuerpo: { panelId, numero: '003', nombre: 'Ana' } });
    const vieja = await dispararAlarma();
    await ctx.pedir('POST', `/alarmas/${vieja}/cerrar`, { token: tokenAdmin, cuerpo: { desenlace: 'falsa_alarma', motivo: 'mascota_objeto' } });
    const id = await dispararAlarma();
    const { cuerpo } = await ctx.pedir('GET', `/alarmas/${id}/contexto`, { token: tokenAdmin });
    expect(cuerpo.horarios).toHaveLength(1);
    expect(cuerpo.usuariosPanel[0]).toMatchObject({ numero: '003', nombre: 'Ana' });
    expect(cuerpo.previas).toHaveLength(1);
    expect(cuerpo.previas[0]).toMatchObject({ id: vieja, desenlace: 'falsa_alarma' });
  });
});
