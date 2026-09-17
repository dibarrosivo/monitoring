import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * El vigilante de paneles silenciosos avisa una vez por episodio de silencio.
 * Antes reabría la alarma cada minuto después de que el operador la cerrara,
 * mientras el panel siguiera mudo: la cola se llenaba de repeticiones.
 */

let ctx: Contexto;
let token: string;
let panelId: number;

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
  token = await ctx.ingresar('admin@test.local', 'admin123');
  const clienteId = (await ctx.pedir('POST', '/clientes', { token, cuerpo: { nombre: 'Cliente V' } })).cuerpo.id;
  const sitioId = (await ctx.pedir('POST', '/sitios', { token, cuerpo: { clienteId, nombre: 'Sitio V' } })).cuerpo.id;
  panelId = (await ctx.pedir('POST', '/paneles', { token, cuerpo: { sitioId, numeroCuenta: 'ABC1', intervaloPruebaMin: 10 } })).cuerpo.id;
});

async function envejecer(minutos: number) {
  const { db, panel } = await import('@monitoring/db');
  const { eq } = await import('drizzle-orm');
  await db.update(panel).set({ ultimaSenalEn: new Date(Date.now() - minutos * 60_000) }).where(eq(panel.id, panelId));
}

async function abiertas() {
  return (await ctx.pedir('GET', '/alarmas', { token })).cuerpo as { id: number; evento: { codigo: string } }[];
}

describe('panel silencioso', () => {
  it('abre una alarma cuando pasa 1,5 veces el intervalo sin señal', async () => {
    const { revisarPanelesSilenciosos } = await import('@monitoring/engine');
    await envejecer(16);
    expect(await revisarPanelesSilenciosos()).toBe(1);
    expect((await abiertas()).map((a) => a.evento.codigo)).toEqual(['SIS']);
  });

  it('no la reabre cada minuto después de cerrada mientras el panel siga mudo', async () => {
    const { revisarPanelesSilenciosos } = await import('@monitoring/engine');
    await envejecer(16);
    await revisarPanelesSilenciosos();
    const [alarma] = await abiertas();
    await ctx.pedir('POST', `/alarmas/${alarma!.id}/cerrar`, { token, cuerpo: { desenlace: 'resuelta', motivo: 'tecnico' } });
    expect(await revisarPanelesSilenciosos()).toBe(0);
    expect(await revisarPanelesSilenciosos()).toBe(0);
    expect(await abiertas()).toHaveLength(0);
  });

  it('vuelve a avisar si el panel reportó y se calló de nuevo', async () => {
    const { revisarPanelesSilenciosos, registrarVida } = await import('@monitoring/engine');
    await envejecer(16);
    await revisarPanelesSilenciosos();
    const [alarma] = await abiertas();
    await ctx.pedir('POST', `/alarmas/${alarma!.id}/cerrar`, { token, cuerpo: { desenlace: 'resuelta', motivo: 'tecnico' } });
    // Pasa el tiempo: el aviso quedó atrás, el panel reportó después… y se calló otra vez
    const { db, evento } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    await db.update(evento).set({ ocurridoEn: new Date(Date.now() - 40 * 60_000) }).where(eq(evento.codigo, 'SIS'));
    await registrarVida(panelId, new Date(Date.now() - 16 * 60_000));
    expect(await revisarPanelesSilenciosos()).toBe(1);
  });
});
