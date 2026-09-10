import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * Base de datos de pruebas: se crea (si falta), se migra y se vacía entre
 * casos. Nunca toca la base de desarrollo: la URL viene de vitest.integracion
 * y siempre apunta a una base terminada en _test.
 */

const URL_PRUEBAS = process.env.DATABASE_URL ?? '';
const CARPETA_MIGRACIONES = fileURLToPath(new URL('../../db/migraciones', import.meta.url));

if (!URL_PRUEBAS.includes('_test')) {
  throw new Error(`Las pruebas de integración exigen una base terminada en _test (DATABASE_URL=${URL_PRUEBAS})`);
}

/** Crea la base de pruebas si no existe y aplica todas las migraciones. */
export async function prepararBaseDePruebas(): Promise<void> {
  const url = new URL(URL_PRUEBAS);
  const nombreBd = url.pathname.slice(1);
  const urlAdmin = new URL(URL_PRUEBAS);
  urlAdmin.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: urlAdmin.toString() });
  await admin.connect();
  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombreBd]);
  if (existe.rowCount === 0) await admin.query(`CREATE DATABASE "${nombreBd}"`);
  await admin.end();

  const cliente = new pg.Client({ connectionString: URL_PRUEBAS });
  await cliente.connect();
  await migrate(drizzle(cliente), { migrationsFolder: CARPETA_MIGRACIONES });
  await cliente.end();
}

/** Vacía todas las tablas de datos respetando las claves foráneas. */
export async function limpiarBase(): Promise<void> {
  const { pool } = await import('@monitoring/db');
  await pool.query(`
    TRUNCATE TABLE
      auditoria, accion_alarma, alarma, evento, senal, acceso, usuario_panel,
      contacto, horario, zona, panel, sitio, cliente, usuario, configuracion, feriado, catalogo,
      bridge
    RESTART IDENTITY CASCADE
  `);
}

export interface Contexto {
  app: FastifyInstance;
  /** Ejecuta un pedido autenticado con el token indicado */
  pedir: (
    metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
    ruta: string,
    opciones?: { token?: string; cuerpo?: unknown },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ estado: number; cuerpo: any }>;
  ingresar: (email: string, clave: string) => Promise<string>;
}

export async function crearContexto(): Promise<Contexto> {
  const { crearApp } = await import('../src/app.js');
  const { app } = await crearApp({ nivelLog: 'silent', jwtSecreto: 'pruebas' });
  await app.ready();

  async function pedir(
    metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
    ruta: string,
    opciones: { token?: string; cuerpo?: unknown } = {},
  ) {
    const respuesta = await app.inject({
      method: metodo,
      url: `/api${ruta}`,
      headers: opciones.token ? { authorization: `Bearer ${opciones.token}` } : {},
      ...(opciones.cuerpo !== undefined ? { payload: opciones.cuerpo as object } : {}),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cuerpo: any = null;
    try {
      cuerpo = respuesta.json();
    } catch {
      cuerpo = respuesta.body;
    }
    return { estado: respuesta.statusCode, cuerpo };
  }

  async function ingresar(email: string, clave: string): Promise<string> {
    const { estado, cuerpo } = await pedir('POST', '/auth/login', { cuerpo: { email, clave } });
    if (estado !== 200) throw new Error(`Login fallido de ${email}: ${estado} ${JSON.stringify(cuerpo)}`);
    return cuerpo.token as string;
  }

  return { app, pedir, ingresar };
}

/** Alta directa de un usuario (evita depender de la API para armar el escenario). */
export async function crearUsuarioDirecto(datos: {
  email: string;
  nombre: string;
  clave: string;
  rol: 'admin' | 'operador' | 'cliente';
}): Promise<number> {
  const { db, hashearClave, usuario } = await import('@monitoring/db');
  const [fila] = await db
    .insert(usuario)
    .values({ email: datos.email, nombre: datos.nombre, rol: datos.rol, hashClave: hashearClave(datos.clave) })
    .returning({ id: usuario.id });
  return fila!.id;
}
