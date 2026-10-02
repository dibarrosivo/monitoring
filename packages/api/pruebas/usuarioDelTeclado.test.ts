import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Quién armó o desarmó. El panel lo reporta en el mismo campo donde otros
 * eventos traen el número de zona, así que resolverlo contra la tabla de zonas
 * le mostraba al operador una zona que no tenía nada que ver con lo que pasó
 * («zona 001 - INFRARROJO ENTRADA» en una apertura que hizo el usuario 1), y en
 * las alarmas de apertura fuera de horario la persona no aparecía por ningún
 * lado.
 */

let ctx: Contexto;
let tokenAdmin: string;
let tokenOperador: string;
let panelId: number;

const CUENTA = 'BEEF';

/** Mete una señal por el procesador, como si la hubiera transmitido el panel. */
async function transmitir(normalizado: {
  categoria: string;
  codigo: string;
  descripcion: string;
  zona: string;
  prioridad: number;
}): Promise<void> {
  const { procesarEvento } = await import('@monitoring/engine');
  const { db, senal } = await import('@monitoring/db');
  const [filaSenal] = await db
    .insert(senal)
    .values({ fuente: 'prueba', cruda: 'prueba', recibidaEn: new Date(), estadoParse: 'ok' })
    .returning({ id: senal.id });
  await procesarEvento({
    senalId: filaSenal!.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    normalizado: { numeroCuenta: CUENTA, particion: '01', ...normalizado } as any,
    recibidaEn: new Date(),
  });
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
  await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Operador', clave: 'oper123', rol: 'operador' });
  tokenAdmin = await ctx.ingresar('admin@test.local', 'admin123');
  tokenOperador = await ctx.ingresar('oper@test.local', 'oper123');

  const clienteId = (await ctx.pedir('POST', '/clientes', { token: tokenAdmin, cuerpo: { nombre: 'Comercial Andina' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token: tokenAdmin, cuerpo: { clienteId, nombre: 'Local' } })).cuerpo.id;
  panelId = (await ctx.pedir('POST', '/paneles', { token: tokenAdmin, cuerpo: { sitioId, numeroCuenta: CUENTA } })).cuerpo.id;

  // La trampa: la zona 001 existe y tiene nombre, igual que el usuario 001
  await ctx.pedir('POST', '/zonas', { token: tokenAdmin, cuerpo: { panelId, numero: '001', descripcion: 'INFRARROJO ENTRADA' } });
  await ctx.pedir('POST', '/usuarios-panel', { token: tokenAdmin, cuerpo: { panelId, numero: '001', nombre: 'Laura Ríos' } });
});

describe('el número de un evento: zona o persona del teclado', () => {
  it('en una apertura se nombra a la persona y NO se inventa una zona', async () => {
    await transmitir({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario', zona: '001', prioridad: 4 });

    const { cuerpo } = await ctx.pedir('GET', `/eventos?panelId=${panelId}`, { token: tokenOperador });
    const apertura = cuerpo.find((e: { codigo: string }) => e.codigo === 'E401');
    expect(apertura.descripcion).toContain('Laura Ríos');
    expect(apertura.usuarioPanelNombre).toBe('Laura Ríos');
    expect(apertura.zonaDescripcion).toBeNull();
  });

  it('en una alarma de robo el mismo número sí es la zona', async () => {
    await transmitir({ categoria: 'alarma', codigo: 'E130', descripcion: 'Robo', zona: '001', prioridad: 2 });

    const { cuerpo } = await ctx.pedir('GET', `/eventos?panelId=${panelId}`, { token: tokenOperador });
    const robo = cuerpo.find((e: { codigo: string }) => e.codigo === 'E130');
    expect(robo.zonaDescripcion).toBe('INFRARROJO ENTRADA');
    expect(robo.usuarioPanelNombre).toBeNull();
  });

  it('cuando el código no está dado de alta, el aviso dice que es desconocido', async () => {
    await transmitir({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario', zona: '007', prioridad: 4 });
    const { fraseParaEvento } = await import('@monitoring/shared');
    const { cuerpo } = await ctx.pedir('GET', `/eventos?panelId=${panelId}`, { token: tokenOperador });
    const ev = cuerpo.find((e: { zona: string }) => e.zona === '007');
    expect(fraseParaEvento({ ...ev, panelId }, { nombrarSitio: false })?.cuerpo).toBe('Desarmado por usuario 007 desconocido');
  });

  it('la apertura fuera de horario nombra a quien entró, y en la cola se ve la persona', async () => {
    // Horario que no cubre ninguna hora: cualquier apertura cae fuera
    await ctx.pedir('POST', '/horarios', {
      token: tokenAdmin,
      cuerpo: { panelId, dias: 'LMXJVSD', apertura: '09:00', cierre: '09:01', toleranciaMin: 1 },
    });
    await transmitir({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario', zona: '001', prioridad: 4 });

    const { cuerpo: alarmas } = await ctx.pedir('GET', '/alarmas', { token: tokenOperador });
    const fuera = alarmas.find((a: { evento: { codigo: string } }) => a.evento.codigo === 'HOR-AF');
    expect(fuera, 'la apertura debió abrir una alarma de horario').toBeTruthy();
    expect(fuera.evento.descripcion).toContain('Laura Ríos');
    expect(fuera.usuarioPanelNombre).toBe('Laura Ríos');
    // Lo que se veía antes: la descripción de una zona que no participó
    expect(fuera.zonaDescripcion).toBeNull();
  });
});

describe('la lista de códigos sin nombre', () => {
  /** El panel tiene que estar reportando: si no, no interesa completarlo. */
  async function marcarComoVivo(dias = 0): Promise<void> {
    const { db, panel } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    await db
      .update(panel)
      .set({ ultimaSenalEn: new Date(Date.now() - dias * 24 * 3600_000) })
      .where(eq(panel.id, panelId));
  }

  it('sale el código que se usa y nadie registró, con cuántas veces', async () => {
    await marcarComoVivo();
    await transmitir({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura', zona: '007', prioridad: 4 });
    await transmitir({ categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre', zona: '007', prioridad: 4 });

    const { cuerpo } = await ctx.pedir('GET', '/codigos-sin-nombre', { token: tokenOperador });
    expect(cuerpo).toHaveLength(1);
    expect(cuerpo[0]).toMatchObject({ codigo: '007', eventos: 2, clienteNombre: 'Comercial Andina', panelId });
  });

  it('el que ya tiene nombre no sale, y guardarlo lo saca de la lista', async () => {
    await marcarComoVivo();
    // El 001 está dado de alta como Laura Ríos desde el principio
    await transmitir({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura', zona: '001', prioridad: 4 });
    await transmitir({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura', zona: '007', prioridad: 4 });
    expect((await ctx.pedir('GET', '/codigos-sin-nombre', { token: tokenOperador })).cuerpo.map((c: { codigo: string }) => c.codigo)).toEqual(['007']);

    await ctx.pedir('POST', '/usuarios-panel', { token: tokenAdmin, cuerpo: { panelId, numero: '007', nombre: 'Pedro Salas' } });
    expect((await ctx.pedir('GET', '/codigos-sin-nombre', { token: tokenOperador })).cuerpo).toEqual([]);
  });

  it('el 000 no sale: es armar sin código, no una persona sin registrar', async () => {
    await marcarComoVivo();
    await transmitir({ categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre', zona: '000', prioridad: 4 });
    expect((await ctx.pedir('GET', '/codigos-sin-nombre', { token: tokenOperador })).cuerpo).toEqual([]);
  });

  it('las cuentas que no reportan hace un mes quedan afuera', async () => {
    await transmitir({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura', zona: '007', prioridad: 4 });
    await marcarComoVivo(45);
    expect((await ctx.pedir('GET', '/codigos-sin-nombre', { token: tokenOperador })).cuerpo).toEqual([]);
  });
});
