import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as esquema from './esquema.js';

const url = process.env.DATABASE_URL ?? 'postgres://monitoring:monitoring@localhost:5433/monitoring';

export const pool = new pg.Pool({ connectionString: url });
/*
 * Si Postgres corta una conexión ociosa (al reiniciarse, por ejemplo), el pool
 * emite 'error'. Sin quien lo escuche, Node trata eso como un error no
 * manejado y tira abajo el proceso: le pasó al receptor en el reinicio del
 * 4 de octubre. El pool descarta esa conexión y abre otra cuando haga falta.
 */
pool.on('error', (err) => {
  console.error('Conexión de la base cortada; el pool abre otra cuando haga falta:', err.message);
});
export const db = drizzle(pool, { schema: esquema });
export * from './esquema.js';
export * from './claves.js';
export * from './depuracion.js';

export const CANAL_ALARMAS = 'nueva_alarma';
export const CANAL_EVENTOS = 'nuevo_evento';

/** Publica en un canal de Postgres (NOTIFY) para el tiempo real de la consola. */
export async function notificar(canal: string, carga: unknown): Promise<void> {
  await pool.query('SELECT pg_notify($1, $2)', [canal, JSON.stringify(carga)]);
}

/**
 * Escucha un canal de Postgres (LISTEN) con un cliente dedicado.
 * Devuelve una función para dejar de escuchar.
 */
export async function escucharCanal(
  canales: string[],
  alRecibir: (canal: string, carga: string) => void,
): Promise<() => Promise<void>> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  for (const canal of canales) {
    await cliente.query(`LISTEN ${canal}`);
  }
  cliente.on('notification', (msg) => {
    alRecibir(msg.channel, msg.payload ?? '');
  });
  return async () => {
    await cliente.end();
  };
}
