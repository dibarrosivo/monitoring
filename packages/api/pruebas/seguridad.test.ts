import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearContexto, crearUsuarioDirecto, limpiarBase, prepararBaseDePruebas, type Contexto } from './ayuda.js';

/**
 * Lo que salió de la revisión de seguridad del 2026-10-05. Cada caso es un
 * hueco que existía en producción.
 */

let ctx: Contexto;

/** Login desde una IP dada (Caddy la pone en X-Forwarded-For). */
async function login(email: string, clave: string, ip = '203.0.113.10') {
  const r = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'x-forwarded-for': ip },
    payload: { email, clave },
  });
  return { estado: r.statusCode, cuerpo: r.json() };
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

describe('límite de intentos del login', () => {
  it('cinco fallos traban la cuenta, aunque después llegue la clave correcta', async () => {
    await crearUsuarioDirecto({ email: 'jefe@test.local', nombre: 'Jefe', clave: 'clave-correcta-1', rol: 'admin' });
    for (let i = 0; i < 5; i++) expect((await login('jefe@test.local', 'otra-cosa', '203.0.113.1')).estado).toBe(401);
    // Desde otra IP y con la clave buena: la traba es de la cuenta, no de la IP
    expect((await login('jefe@test.local', 'clave-correcta-1', '203.0.113.2')).estado).toBe(429);
  });

  it('un login correcto borra los fallos anteriores de esa cuenta', async () => {
    await crearUsuarioDirecto({ email: 'oper@test.local', nombre: 'Oper', clave: 'clave-correcta-2', rol: 'operador' });
    for (let i = 0; i < 4; i++) await login('oper@test.local', 'mal', '203.0.113.3');
    expect((await login('oper@test.local', 'clave-correcta-2', '203.0.113.3')).estado).toBe(200);
    for (let i = 0; i < 4; i++) await login('oper@test.local', 'mal', '203.0.113.3');
    expect((await login('oper@test.local', 'clave-correcta-2', '203.0.113.3')).estado).toBe(200);
  });

  it('quien prueba muchas cuentas desde una IP queda frenado, y las demás IP no', async () => {
    await crearUsuarioDirecto({ email: 'victima@test.local', nombre: 'V', clave: 'clave-correcta-3', rol: 'admin' });
    for (let i = 0; i < 20; i++) await login(`probando${i}@test.local`, 'mal', '198.51.100.7');
    expect((await login('victima@test.local', 'clave-correcta-3', '198.51.100.7')).estado).toBe(429);
    expect((await login('victima@test.local', 'clave-correcta-3', '198.51.100.8')).estado).toBe(200);
  });

  it('los operadores que comparten la IP de la oficina no se traban entre ellos', async () => {
    await crearUsuarioDirecto({ email: 'turno@test.local', nombre: 'T', clave: 'clave-correcta-4', rol: 'operador' });
    for (let i = 0; i < 30; i++) expect((await login('turno@test.local', 'clave-correcta-4', '192.0.2.50')).estado).toBe(200);
  });

  it('un correo que no existe responde igual que una clave mala', async () => {
    await crearUsuarioDirecto({ email: 'existe@test.local', nombre: 'E', clave: 'clave-correcta-5', rol: 'operador' });
    const noExiste = await login('nadie@test.local', 'x', '203.0.113.20');
    const malaClave = await login('existe@test.local', 'x', '203.0.113.21');
    expect(noExiste).toEqual(malaClave);
  });
});

describe('la API ve la IP real', () => {
  it('el registro de sesiones anota la IP del cliente y no la de Caddy', async () => {
    await crearUsuarioDirecto({ email: 'ip@test.local', nombre: 'IP', clave: 'clave-correcta-6', rol: 'operador' });
    await login('ip@test.local', 'clave-correcta-6', '203.0.113.99');
    const { db, sesionOperador } = await import('@monitoring/db');
    const [sesion] = await db.select({ ip: sesionOperador.ip }).from(sesionOperador).limit(1);
    expect(sesion?.ip).toBe('203.0.113.99');
  });
});

describe('claves', () => {
  it('no se aceptan claves de menos de 10 caracteres al crear un usuario', async () => {
    await crearUsuarioDirecto({ email: 'admin@test.local', nombre: 'Admin', clave: 'clave-correcta-7', rol: 'admin' });
    const token = (await login('admin@test.local', 'clave-correcta-7')).cuerpo.token as string;
    const r = await ctx.pedir('POST', '/usuarios', {
      token,
      cuerpo: { email: 'nuevo@test.local', nombre: 'Nuevo', clave: 'corta123', rol: 'operador' },
    });
    expect(r.estado).toBe(400);
  });
});

describe('canal en vivo', () => {
  it('una sesión de alguien dado de baja ya no abre el canal', async () => {
    await crearUsuarioDirecto({ email: 'ex@test.local', nombre: 'Ex operador', clave: 'clave-correcta-8', rol: 'operador' });
    const token = (await login('ex@test.local', 'clave-correcta-8')).cuerpo.token as string;

    const { db, usuario } = await import('@monitoring/db');
    const { eq } = await import('drizzle-orm');
    await db.update(usuario).set({ activo: false }).where(eq(usuario.email, 'ex@test.local'));

    const ws = await ctx.app.injectWS(`/api/ws?token=${token}`);
    const codigo = await new Promise<number>((listo) => ws.on('close', (c: number) => listo(c)));
    expect(codigo).toBe(4401);
  });

  it('una sesión vigente sí lo abre', async () => {
    await crearUsuarioDirecto({ email: 'activo@test.local', nombre: 'Activo', clave: 'clave-correcta-9', rol: 'operador' });
    const token = (await login('activo@test.local', 'clave-correcta-9')).cuerpo.token as string;
    const ws = await ctx.app.injectWS(`/api/ws?token=${token}`);
    const cerro = await new Promise<boolean>((listo) => {
      ws.on('close', () => listo(true));
      setTimeout(() => listo(false), 500);
    });
    expect(cerro).toBe(false);
    ws.terminate();
  });
});
