import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Una cuenta dada de baja no debe seguir sonando. El procesador no miraba si
 * el equipo o el cliente estaban activos: un cliente dado de baja seguía
 * abriendo alarmas de robo y de «apertura fuera de horario» todos los días
 * (Cosmetodo, octubre 2026). Lo que transmita igual queda en el historial.
 */

let ctx: Contexto;
let tokenAdmin: string;
let clienteId: number;
let panelId: number;

const CUENTA = 'CAFE';
const ROBO = { categoria: 'alarma', codigo: 'E130', descripcion: 'Robo en zona 1', zona: '001', prioridad: 1 };
// Domingo 03:00 en Caracas: fuera de cualquier horario de lunes a viernes
const DOMINGO_MADRUGADA = new Date('2026-10-04T07:00:00Z');
const APERTURA = { categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado)', zona: '002', prioridad: 4 };

async function transmitir(normalizado: typeof ROBO, recibidaEn = new Date()): Promise<number> {
  const { procesarEvento } = await import('@monitoring/engine');
  const { db, senal } = await import('@monitoring/db');
  const [filaSenal] = await db
    .insert(senal)
    .values({ fuente: 'prueba', cruda: 'prueba', recibidaEn, estadoParse: 'ok' })
    .returning({ id: senal.id });
  const r = await procesarEvento({
    senalId: filaSenal!.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    normalizado: { numeroCuenta: CUENTA, particion: '01', ...normalizado } as any,
    recibidaEn,
  });
  return r.eventoId;
}

async function alarmasDelPanel(): Promise<number> {
  const { db, alarma } = await import('@monitoring/db');
  const { eq } = await import('drizzle-orm');
  return (await db.select({ id: alarma.id }).from(alarma).where(eq(alarma.panelId, panelId))).length;
}

async function descripcionDe(eventoId: number): Promise<string> {
  const { db, evento } = await import('@monitoring/db');
  const { eq } = await import('drizzle-orm');
  const [fila] = await db.select({ descripcion: evento.descripcion }).from(evento).where(eq(evento.id, eventoId));
  return fila!.descripcion;
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
  await crearUsuarioDirecto({ email: 'admin@test.local', nombre: 'Admin', clave: 'admin12345', rol: 'admin' });
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin12345');
  clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Perfumería Los Andes' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Tienda' } })).cuerpo.id;
  panelId = (await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: CUENTA } })).cuerpo.id;
  await ctx.pedir('POST', '/horarios', {
    token: tokenAdmin,
    cuerpo: { panelId, dias: 'LMXJV--', apertura: '08:00', cierre: '17:00' },
  });
});

describe('cuenta inactiva', () => {
  it('activa: un robo y una apertura fuera de horario abren alarma (control)', async () => {
    await transmitir(ROBO);
    await transmitir(APERTURA, DOMINGO_MADRUGADA);
    expect(await alarmasDelPanel()).toBe(2);
  });

  it('equipo desactivado: queda en el historial, sin alarmas', async () => {
    await ctx.pedir('PUT', `/paneles/${panelId}`, { token: tokenAdmin, cuerpo: { activo: false } });
    const id = await transmitir(ROBO);
    await transmitir(APERTURA, DOMINGO_MADRUGADA);
    expect(await alarmasDelPanel()).toBe(0);
    expect(await descripcionDe(id)).toContain('CUENTA INACTIVA');
  });

  it('cliente dado de baja con el equipo todavía activo: tampoco suena', async () => {
    const r = await ctx.pedir('PUT', `/clientes/${clienteId}/estado`, {
      token: tokenAdmin,
      cuerpo: { estado: 'baja', motivoEstado: 'Canceló el servicio' },
    });
    expect(r.estado).toBe(200);
    const id = await transmitir(ROBO);
    await transmitir(APERTURA, DOMINGO_MADRUGADA);
    expect(await alarmasDelPanel()).toBe(0);
    expect(await descripcionDe(id)).toContain('CUENTA INACTIVA');
  });
});
