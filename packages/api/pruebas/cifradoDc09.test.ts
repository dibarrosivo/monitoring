import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { construirTramaAdmCid, construirTramaAdmCidCifrada, normalizarClaveAes } from '@monitoring/protocols';
import { manejarTramaDc09 } from '../../receiver/src/dc09Manejador.js';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Cifrado de DC-09 en el receptor. El 9999 está abierto a internet porque los
 * paneles salen por SIM con IP variable: lo que impide meter un evento falso es
 * el cifrado, y lo que impide reenviar uno capturado es la hora de la trama.
 */

let ctx: Contexto;
const CLAVE = normalizarClaveAes('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')!;
const log = pino({ level: 'silent' });

function cifrada(cuenta: string, marcaTiempo?: Date) {
  return construirTramaAdmCidCifrada({ cuenta, calificador: 1, codigoCid: '401', particion: '01', zona: '003', claveAes: CLAVE, marcaTiempo });
}
function enClaro(cuenta: string) {
  return construirTramaAdmCid({ cuenta, calificador: 1, codigoCid: '401', particion: '01', zona: '003', marcaTiempo: new Date() });
}
const esAck = (r: Buffer) => r.toString('latin1').includes('"ACK"') || r.toString('latin1').includes('"*ACK"');
const esNak = (r: Buffer) => r.toString('latin1').includes('"NAK"');

async function ultimaSenal() {
  const { db, senal } = await import('@monitoring/db');
  const { desc } = await import('drizzle-orm');
  const [s] = await db.select().from(senal).orderBy(desc(senal.id)).limit(1);
  return s!;
}
async function eventos() {
  const { db, evento } = await import('@monitoring/db');
  return db.select().from(evento);
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
  await crearUsuarioDirecto({ email: 'admin@test.local', nombre: 'Admin', clave: 'clave-admin-123', rol: 'admin' });
  const token = await ctx.ingresar('admin@test.local', 'clave-admin-123');
  const clienteId = (await ctx.pedir('POST', '/clientes', { token, cuerpo: { nombre: 'Comercial Andina' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token, cuerpo: { clienteId, nombre: 'Local' } })).cuerpo.id;
  // Una cuenta que ya exige cifrado y otra que todavía no
  await ctx.pedir('POST', '/paneles', { token, cuerpo: { sitioId, numeroCuenta: 'A001', tipo: 'hikvision', cifradoObligatorio: true } });
  await ctx.pedir('POST', '/paneles', { token, cuerpo: { sitioId, numeroCuenta: 'A002', tipo: 'hikvision' } });
});

describe('control de hora de las tramas cifradas', () => {
  it('una trama cifrada al día entra normal', async () => {
    expect(esAck(await manejarTramaDc09(cifrada('A002', new Date()), 'dc09-tcp', 'prueba', log, CLAVE, 'exigir'))).toBe(true);
    expect((await ultimaSenal()).estadoParse).toBe('ok');
    expect(await eventos()).toHaveLength(1);
  });

  it('en observación, una trama vieja entra igual pero queda anotada', async () => {
    const vieja = new Date(Date.now() - 10 * 60_000);
    expect(esAck(await manejarTramaDc09(cifrada('A002', vieja), 'dc09-tcp', 'prueba', log, CLAVE, 'observar'))).toBe(true);
    const s = await ultimaSenal();
    expect(s.estadoParse).toBe('ok');
    expect(s.detalleError).toMatch(/atrasada 60[0-2] s \(en observación: se aceptó\)/);
    expect(await eventos()).toHaveLength(1);
  });

  it('exigiendo, una trama vieja se rechaza y no crea evento: es una trama reenviada', async () => {
    const vieja = new Date(Date.now() - 10 * 60_000);
    const r = await manejarTramaDc09(cifrada('A002', vieja), 'dc09-tcp', 'prueba', log, CLAVE, 'exigir');
    expect(esNak(r)).toBe(true);
    // El NAK lleva la hora del receptor, para que un panel con el reloj corrido se corrija
    expect(r.toString('latin1')).toMatch(/_\d{2}:\d{2}:\d{2},\d{2}-\d{2}-\d{4}/);
    expect((await ultimaSenal()).detalleError).toMatch(/posible repetición/);
    expect(await eventos()).toHaveLength(0);
  });

  it('exigiendo, una trama cifrada sin hora se rechaza', async () => {
    expect(esNak(await manejarTramaDc09(cifrada('A002'), 'dc09-tcp', 'prueba', log, CLAVE, 'exigir'))).toBe(true);
    expect(await eventos()).toHaveLength(0);
  });
});

describe('cifrado obligatorio por cuenta', () => {
  it('una trama en claro de una cuenta que exige cifrado se rechaza y queda en el diario', async () => {
    expect(esNak(await manejarTramaDc09(enClaro('A001'), 'dc09-tcp', 'prueba', log, CLAVE, 'exigir'))).toBe(true);
    const s = await ultimaSenal();
    expect(s.estadoParse).toBe('error');
    expect(s.detalleError).toBe('en claro, y la cuenta exige cifrado');
    expect(await eventos()).toHaveLength(0);
  });

  it('la misma cuenta, cifrada, entra', async () => {
    expect(esAck(await manejarTramaDc09(cifrada('A001', new Date()), 'dc09-tcp', 'prueba', log, CLAVE, 'exigir'))).toBe(true);
    expect(await eventos()).toHaveLength(1);
  });

  it('las cuentas que todavía no exigen cifrado siguen entrando en claro', async () => {
    expect(esAck(await manejarTramaDc09(enClaro('A002'), 'dc09-tcp', 'prueba', log, CLAVE, 'exigir'))).toBe(true);
    expect(await eventos()).toHaveLength(1);
  });

  it('con la clave puesta, un panel en claro sigue entrando: se puede migrar de a uno', async () => {
    expect(esAck(await manejarTramaDc09(enClaro('A002'), 'dc09-tcp', 'prueba', log, CLAVE, 'observar'))).toBe(true);
  });
});

describe('la casilla de la consola', () => {
  it('se puede encender y apagar desde la edición del dispositivo', async () => {
    const token = await ctx.ingresar('admin@test.local', 'clave-admin-123');
    const { db, panel } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    const [p] = await db.select({ id: panel.id }).from(panel).where(eq(panel.numeroCuenta, 'A002'));
    expect((await ctx.pedir('PUT', `/paneles/${p!.id}`, { token, cuerpo: { cifradoObligatorio: true } })).estado).toBe(200);
    const estado = (await ctx.pedir('GET', '/paneles/estado', { token })).cuerpo.find((x: { id: number }) => x.id === p!.id);
    expect(estado.cifradoObligatorio).toBe(true);
  });
});
