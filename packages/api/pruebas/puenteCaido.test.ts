import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Caída del puente PIMA de punta a punta: el vigilante la detecta recién al
 * 5.º latido perdido, abre UNA alarma por episodio y avisa la vuelta con la
 * duración real del corte.
 */

const MIN = 60_000;
let ctx: Contexto;

async function crearPuente(ultimoLatidoHaceMin: number): Promise<number> {
  const { db, bridge } = await import('@monitoring/db');
  const [fila] = await db
    .insert(bridge)
    .values({ nombre: 'puente-prueba', intervaloLatidoSeg: 60, ultimoLatidoEn: new Date(Date.now() - ultimoLatidoHaceMin * MIN) })
    .returning({ id: bridge.id });
  return fila!.id;
}

async function eventosDelPuente(): Promise<{ codigo: string | null; descripcion: string; alarmas: number }[]> {
  const { db, evento, alarma } = await import('@monitoring/db');
  const { eq, inArray, sql } = await import('drizzle-orm');
  return db
    .select({ codigo: evento.codigo, descripcion: evento.descripcion, alarmas: sql<number>`count(${alarma.id})`.mapWith(Number) })
    .from(evento)
    .leftJoin(alarma, eq(alarma.eventoId, evento.id))
    .where(inArray(evento.codigo, ['BRIDGE', 'BRIDGE-R']))
    .groupBy(evento.id)
    .orderBy(evento.id);
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
});

describe('caída del puente', () => {
  it('4 latidos perdidos todavía no es caída', async () => {
    const { revisarPuentes } = await import('@monitoring/engine');
    await crearPuente(4.5);
    expect(await revisarPuentes()).toBe(0);
    expect(await eventosDelPuente()).toEqual([]);
  });

  it('al 5.º latido perdido abre una alarma, una sola vez, y avisa la vuelta con la duración', async () => {
    const { revisarPuentes } = await import('@monitoring/engine');
    const { db, bridge } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    const id = await crearPuente(40);

    expect(await revisarPuentes()).toBe(1);
    expect(await revisarPuentes()).toBe(0); // mismo episodio: no se repite
    let eventos = await eventosDelPuente();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ codigo: 'BRIDGE', alarmas: 1 });
    expect(eventos[0]!.descripcion).toContain('PUENTE CAÍDO');

    await db.update(bridge).set({ ultimoLatidoEn: new Date() }).where(eq(bridge.id, id));
    expect(await revisarPuentes()).toBe(1);
    eventos = await eventosDelPuente();
    expect(eventos[1]).toMatchObject({ codigo: 'BRIDGE-R', alarmas: 0 });
    expect(eventos[1]!.descripcion).toContain('tras 40 min');
  });

  it('el detalle de la alarma trae las listas vacías (la app se caía al abrirla)', async () => {
    const { revisarPuentes } = await import('@monitoring/engine');
    await crearPuente(40);
    await revisarPuentes();
    await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Operador', clave: 'oper123456', rol: 'operador' });
    const token = await ctx.ingresar('oper@test.local', 'oper123456');
    const { cuerpo: alarmas } = await ctx.pedir('GET', '/alarmas', { token });
    const delPuente = alarmas.find((a: { panelId: number | null }) => a.panelId === null);
    expect(delPuente).toBeDefined();

    const { estado, cuerpo } = await ctx.pedir('GET', `/alarmas/${delPuente.id}/contexto`, { token });
    expect(estado).toBe(200);
    expect(cuerpo).toMatchObject({ cliente: null, previas: [], horarios: [], usuariosPanel: [], contactos: [], pasosCumplidos: [] });
    expect(Array.isArray(cuerpo.pasos)).toBe(true);
  });
});
