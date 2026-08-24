import pino from 'pino';
import { pool } from '@monitoring/db';
import { iniciarVigilante } from '@monitoring/engine';
import { iniciarDc09Tcp } from './dc09Tcp.js';
import { iniciarDc09Udp } from './dc09Udp.js';

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

const log = pino({ level: process.env.NIVEL_LOG ?? 'info' });

const puertoTcp = process.env.PUERTO_DC09_TCP ?? '9999';
const puertoUdp = process.env.PUERTO_DC09_UDP ?? '9999';

const servidorTcp = iniciarDc09Tcp(puertoTcp, log);
const servidorUdp = iniciarDc09Udp(puertoUdp, log);
const detenerVigilante = iniciarVigilante({
  alError: (err) => log.error({ err }, 'Error del vigilante de paneles'),
});

log.info('Receptor de señales iniciado');

async function apagar(senalSo: string) {
  log.info({ senal: senalSo }, 'Apagando receptor');
  detenerVigilante();
  servidorTcp.close();
  servidorUdp.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));
