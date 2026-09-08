import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limpiarBase, prepararBaseDePruebas } from './ayuda.js';

/**
 * Retención del diario crudo: se borran las tramas viejas, pero el registro
 * operativo (eventos y alarmas) tiene que sobrevivir intacto.
 */

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

/** Inserta una señal con la fecha de recepción indicada y su evento decodificado. */
async function senalConEvento(diasAtras: number): Promise<{ senalId: number; eventoId: number }> {
  const { db, evento, senal } = await import('@monitoring/db');
  const { sql } = await import('drizzle-orm');
  const [filaSenal] = await db
    .insert(senal)
    .values({
      fuente: 'dc09-tcp',
      remoto: '127.0.0.1:1',
      cruda: `trama de hace ${diasAtras} días`,
      estadoParse: 'ok',
      recibidaEn: sql`now() - (${diasAtras} * interval '1 day')` as unknown as Date,
    })
    .returning({ id: senal.id });
  const [filaEvento] = await db
    .insert(evento)
    .values({
      senalId: filaSenal!.id,
      numeroCuenta: '1234',
      categoria: 'alarma',
      codigo: 'E130',
      descripcion: 'Robo',
      prioridad: 2,
      ocurridoEn: sql`now() - (${diasAtras} * interval '1 day')` as unknown as Date,
    })
    .returning({ id: evento.id });
  return { senalId: filaSenal!.id, eventoId: filaEvento!.id };
}

describe('depurarSenales', () => {
  it('borra las señales viejas y conserva las recientes', async () => {
    const { depurarSenales, db, senal } = await import('@monitoring/db');
    await senalConEvento(400);
    await senalConEvento(10);

    const resultado = await depurarSenales(365);
    expect(resultado.eliminadas).toBe(1);

    const quedan = await db.select().from(senal);
    expect(quedan).toHaveLength(1);
    expect(quedan[0]!.cruda).toContain('hace 10 días');
  });

  it('el evento sobrevive a la depuración de su señal, sin la referencia', async () => {
    const { depurarSenales, db, evento } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    const { eventoId } = await senalConEvento(400);

    await depurarSenales(365);

    const [sobreviviente] = await db.select().from(evento).where(eq(evento.id, eventoId));
    expect(sobreviviente).toBeDefined();
    expect(sobreviviente!.codigo).toBe('E130');
    expect(sobreviviente!.descripcion).toBe('Robo');
    expect(sobreviviente!.senalId).toBeNull();
  });

  it('no borra nada si no hay señales fuera del período', async () => {
    const { depurarSenales } = await import('@monitoring/db');
    await senalConEvento(5);
    expect((await depurarSenales(365)).eliminadas).toBe(0);
  });

  it('rechaza retenciones inválidas para no vaciar el diario por error', async () => {
    const { depurarSenales } = await import('@monitoring/db');
    await expect(depurarSenales(0)).rejects.toThrow(/Retención inválida/);
    await expect(depurarSenales(-5)).rejects.toThrow(/Retención inválida/);
    await expect(depurarSenales(Number.NaN)).rejects.toThrow(/Retención inválida/);
  });
});
