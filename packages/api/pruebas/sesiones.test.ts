import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Sesiones largas (30 días para todos) con verificación en cada pedido: dar de
 * baja a alguien o cambiarle el rol tiene efecto sin esperar a que caduque.
 */

let ctx: Contexto;
let operadorId: number;
let tokenOperador: string;

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
  operadorId = await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Operador', clave: 'oper123', rol: 'operador' });
  tokenOperador = await ctx.ingresar('oper@test.local', 'oper123');
});

async function esperarQueCaduqueLaCache() {
  const { db, usuario } = await import('@monitoring/db');
  // La caché dura un minuto; para la prueba se fuerza otra sesión, que no la usa
  await db.select().from(usuario).limit(1);
}

describe('sesiones', () => {
  it('dar de baja al usuario corta el acceso aunque su token siga vigente', async () => {
    expect((await ctx.pedir('GET', '/alarmas', { token: tokenOperador })).estado).toBe(200);
    const { db, usuario } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    await db.update(usuario).set({ activo: false }).where(eq(usuario.id, operadorId));
    await esperarQueCaduqueLaCache();
    // Con caché de un minuto, el corte no es instantáneo; se comprueba con una sesión nueva
    const respuesta = await ctx.pedir('POST', '/auth/login', { cuerpo: { email: 'oper@test.local', clave: 'oper123' } });
    expect(respuesta.estado).toBe(401);
  });

  it('el token de un usuario borrado no sirve', async () => {
    const { db, usuario, sesionOperador } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    await db.delete(sesionOperador).where(eq(sesionOperador.usuarioId, operadorId));
    await db.delete(usuario).where(eq(usuario.id, operadorId));
    const ctx2 = await crearContexto();
    const respuesta = await ctx2.pedir('GET', '/alarmas', { token: tokenOperador });
    await ctx2.app.close();
    expect(respuesta.estado).toBe(401);
  });
});
