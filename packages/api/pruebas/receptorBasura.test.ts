import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { registrarSenal } from '@monitoring/engine';
import { registrarEscaneo } from '../../receiver/src/basura.js';
import { limpiarBase, prepararBaseDePruebas } from './ayuda.js';

/**
 * Lo que tumbó el receptor 4 veces entre el 4 y el 6 de octubre de 2026: un
 * escáner de internet mandó un saludo TLS al puerto de los paneles, ese saludo
 * trae bytes nulos, Postgres no acepta el byte nulo en un campo de texto, y el
 * error se perdía en una promesa sin dueño que Node convierte en caída.
 */

// Primeros bytes de un saludo TLS real: tipo 0x16, versión 0x0301, largo con ceros
const SALUDO_TLS = Buffer.from([0x16, 0x03, 0x01, 0x00, 0xf8, 0x01, 0x00, 0x00, 0xf4, 0x03, 0x03, 0x41, 0x42]);
const log = pino({ level: 'silent' });

async function ultima() {
  const { db, senal } = await import('@monitoring/db');
  const { desc } = await import('drizzle-orm');
  const [s] = await db.select().from(senal).orderBy(desc(senal.id)).limit(1);
  return s!;
}

beforeAll(async () => {
  await prepararBaseDePruebas();
});
afterAll(async () => {
  const { pool } = await import('@monitoring/db');
  await pool.end();
});
beforeEach(async () => {
  await limpiarBase();
});

describe('bytes que Postgres no acepta como texto', () => {
  it('una trama con bytes nulos se guarda igual, en base64 y sin perder un byte', async () => {
    await registrarSenal({ fuente: 'dc09-tcp', remoto: 'prueba', cruda: SALUDO_TLS.toString('latin1'), estadoParse: 'error' });
    const s = await ultima();
    expect(s.codificacion).toBe('base64');
    expect(Buffer.from(s.cruda, 'base64').equals(SALUDO_TLS)).toBe(true);
  });

  it('una trama normal se sigue guardando como texto, legible', async () => {
    await registrarSenal({ fuente: 'dc09-tcp', remoto: 'prueba', cruda: '"ADM-CID"0001L0#5154[#5154|1401 01 003]', estadoParse: 'ok' });
    expect((await ultima()).codificacion).toBe('texto');
  });

  it('anotar el saludo TLS de un escáner no falla, y la muestra queda legible', async () => {
    await expect(
      registrarEscaneo({ fuente: 'dc09-tcp', remoto: '::ffff:203.0.113.5:4444', motivo: 'saludo TLS', datos: SALUDO_TLS, log }),
    ).resolves.toBeUndefined();
    const s = await ultima();
    expect(s.estadoParse).toBe('ignorada');
    expect(s.cruda.startsWith('\\x16\\x03\\x01\\x00')).toBe(true);
  });
});
