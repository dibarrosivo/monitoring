import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Ingreso de tramas desde el puente de la central (receptor PIMA).
 * Se ejercita el camino completo: token, parseo Sur-Gard, evento y alarma.
 */

const TOKEN_PUENTE = 'token-de-prueba-puente';
let ctx: Contexto;
let tokenAdmin: string;

/** Línea Sur-Gard MLR2 como la emite un receptor. */
function lineaCid(cuenta: string, calificador: number, codigo: string, zona: string, particion = '01'): string {
  return `5011${cuenta}18${calificador}${codigo}${particion}${zona}`;
}

beforeAll(async () => {
  process.env.BRIDGE_TOKEN = TOKEN_PUENTE;
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

  const clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Cliente PIMA' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Sitio' } })).cuerpo.id;
  await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: '7002', tipo: 'pima' } });
});

/** El puente se autentica con su token, no con JWT: es una máquina. */
async function enviarTramas(tramas: string[], token = TOKEN_PUENTE) {
  return ctx.app
    .inject({
      method: 'POST',
      url: '/api/bridge/senales',
      headers: { authorization: `Bearer ${token}` },
      payload: { bridge: 'puente-prueba', fuente: 'serie', version: '0.1.0', tramas: tramas.map((cruda) => ({ cruda })) },
    })
    .then((r) => ({ estado: r.statusCode, cuerpo: r.json() as any }));
}

describe('autenticación del puente', () => {
  it('rechaza un token incorrecto', async () => {
    const { estado } = await enviarTramas([lineaCid('7002', 1, '130', '015')], 'token-equivocado');
    expect(estado).toBe(401);
  });

  it('rechaza pedidos sin token', async () => {
    const respuesta = await ctx.app.inject({
      method: 'POST',
      url: '/api/bridge/senales',
      payload: { bridge: 'x', tramas: [{ cruda: 'algo' }] },
    });
    expect(respuesta.statusCode).toBe(401);
  });

  it('un usuario de la central no puede usar las rutas del puente con su JWT', async () => {
    const { estado } = await enviarTramas([lineaCid('7002', 1, '130', '015')], tokenAdmin);
    expect(estado).toBe(401);
  });
});

describe('ingreso de tramas', () => {
  it('convierte una línea Sur-Gard en evento y alarma', async () => {
    const { estado, cuerpo } = await enviarTramas([lineaCid('7002', 1, '130', '004')]);
    expect(estado).toBe(200);
    expect(cuerpo).toMatchObject({ recibidas: 1, procesadas: 1, errores: 0 });

    const eventos = await ctx.pedir('GET', '/eventos?limite=5', { token: tokenAdmin });
    expect(eventos.cuerpo[0]).toMatchObject({ codigo: 'E130', numeroCuenta: '7002', zona: '004' });

    const alarmas = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(alarmas.cuerpo).toHaveLength(1);
    expect(alarmas.cuerpo[0].clienteNombre).toBe('Cliente PIMA');
  });

  it('acepta un lote y marca la fuente pima-bridge en el diario', async () => {
    const { cuerpo } = await enviarTramas([
      lineaCid('7002', 1, '602', '000'),
      lineaCid('7002', 1, '401', '001'),
      lineaCid('7002', 3, '401', '001'),
    ]);
    expect(cuerpo.procesadas).toBe(3);

    const senales = await ctx.pedir('GET', '/senales?limite=10', { token: tokenAdmin });
    expect(senales.cuerpo.every((s: { fuente: string }) => s.fuente === 'pima-bridge')).toBe(true);
  });

  it('el latido del receptor se registra pero no genera evento', async () => {
    const { cuerpo } = await enviarTramas(['1011           @    ']);
    expect(cuerpo).toMatchObject({ procesadas: 0, ignoradas: 1 });
    const eventos = await ctx.pedir('GET', '/eventos', { token: tokenAdmin });
    expect(eventos.cuerpo).toHaveLength(0);
  });

  it('una línea ilegible queda en el diario como error, sin perderse', async () => {
    const { cuerpo } = await enviarTramas(['%%% basura del puerto serie %%%']);
    expect(cuerpo).toMatchObject({ procesadas: 0, errores: 1 });

    const senales = await ctx.pedir('GET', '/senales?limite=5', { token: tokenAdmin });
    expect(senales.cuerpo[0]).toMatchObject({ estadoParse: 'error' });
    expect(senales.cuerpo[0].cruda).toContain('basura');
  });

  it('una cuenta desconocida igual entra a la cola del operador', async () => {
    await enviarTramas([lineaCid('9911', 1, '130', '007')]);
    const alarmas = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(alarmas.cuerpo[0].evento.descripcion).toContain('CUENTA DESCONOCIDA');
  });
});

describe('registro y supervisión del puente', () => {
  it('el puente se da de alta solo con su primer envío', async () => {
    await enviarTramas([lineaCid('7002', 1, '130', '015')]);
    const { cuerpo } = await ctx.pedir('GET', '/bridges', { token: tokenAdmin });
    expect(cuerpo).toHaveLength(1);
    expect(cuerpo[0]).toMatchObject({ nombre: 'puente-prueba', fuente: 'serie', version: '0.1.0', silencioso: false });
  });

  it('el latido actualiza el contador de tramas', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/bridge/latido',
      headers: { authorization: `Bearer ${TOKEN_PUENTE}` },
      payload: { bridge: 'puente-prueba', fuente: 'serie', version: '0.1.0', tramasRecibidas: 42 },
    });
    const { cuerpo } = await ctx.pedir('GET', '/bridges', { token: tokenAdmin });
    expect(cuerpo[0].tramasRecibidas).toBe(42);
  });

  it('un puente sin latidos recientes se marca silencioso y abre alarma', async () => {
    await enviarTramas([lineaCid('7002', 1, '130', '015')]);
    // Se envejece el último latido más allá de tres intervalos
    const { db, bridge } = await import('@monitoring/db');
    const { sql } = await import('drizzle-orm');
    await db.update(bridge).set({ ultimoLatidoEn: sql`now() - interval '10 minutes'` });

    const { cuerpo } = await ctx.pedir('GET', '/bridges', { token: tokenAdmin });
    expect(cuerpo[0].silencioso).toBe(true);

    const { revisarPuentes } = await import('@monitoring/engine');
    expect(await revisarPuentes()).toBe(1);

    const alarmas = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    const caido = alarmas.cuerpo.find((a: { evento: { codigo: string } }) => a.evento.codigo === 'BRIDGE');
    expect(caido.prioridad).toBe(2);
    expect(caido.evento.descripcion).toContain('PUENTE CAÍDO');
  });
});

describe('tap pasivo: tramas binarias y metadatos', () => {
  it('guarda una trama binaria íntegra y no abre alarma', async () => {
    // Carga real capturada en la central: 59 bytes de un protocolo propietario
    const bytes = Buffer.from('81b5b8e3cd17c3c1ac74dbc1f735d086ac65cc81a876ccc1', 'hex');
    const res = await ctx.pedir('POST', '/bridge/senales', {
      token: TOKEN_PUENTE,
      cuerpo: {
        bridge: 'tap-central',
        tramas: [{ crudaB64: bytes.toString('base64'), origen: '45.190.168.48:53828', puerto: 2023 }],
      },
    });
    expect(res.estado).toBe(200);
    expect(res.cuerpo.errores).toBe(1);

    const { db, senal } = await import('@monitoring/db');
    const { desc } = await import('drizzle-orm');
    const [fila] = await db.select().from(senal).orderBy(desc(senal.id)).limit(1);
    expect(fila!.codificacion).toBe('base64');
    expect(fila!.puertoLocal).toBe(2023);
    expect(fila!.remoto).toBe('45.190.168.48:53828');
    // Sin perder un byte
    expect(Buffer.from(fila!.cruda, 'base64').toString('hex')).toBe(bytes.toString('hex'));

    // Lo importante: una trama que no entendemos no genera trabajo al operador
    const alarmas = await ctx.pedir('GET', '/alarmas', { token: tokenAdmin });
    expect(alarmas.cuerpo).toEqual([]);
  });

  it('una trama de texto enviada en base64 se guarda legible', async () => {
    const linea = '1061      7002    TH';
    const res = await ctx.pedir('POST', '/bridge/senales', {
      token: TOKEN_PUENTE,
      cuerpo: {
        bridge: 'tap-central',
        tramas: [{ crudaB64: Buffer.from(linea, 'latin1').toString('base64'), puerto: 1050 }],
      },
    });
    expect(res.estado).toBe(200);
    expect(res.cuerpo.procesadas).toBe(1);

    const { db, senal } = await import('@monitoring/db');
    const { desc } = await import('drizzle-orm');
    const [fila] = await db.select().from(senal).orderBy(desc(senal.id)).limit(1);
    expect(fila!.codificacion).toBe('texto');
    expect(fila!.cruda).toBe(linea);
    expect(fila!.puertoLocal).toBe(1050);
  });

  it('rechaza una trama que no trae ni texto ni binario', async () => {
    const res = await ctx.pedir('POST', '/bridge/senales', {
      token: TOKEN_PUENTE,
      cuerpo: { bridge: 'tap-central', tramas: [{ puerto: 2023 }] },
    });
    expect(res.estado).toBe(400);
  });
});
