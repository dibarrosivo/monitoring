import pino from 'pino';
import { normalizarClaveAes } from '@monitoring/protocols';
import { iniciarDepuracionPeriodica, pool } from '@monitoring/db';
import { iniciarVigilante } from '@monitoring/engine';
import { iniciarDc09Tcp } from './dc09Tcp.js';
import { iniciarDc09Udp } from './dc09Udp.js';
import { iniciarPimaTcp } from './pimaTcp.js';

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

const log = pino({ level: process.env.NIVEL_LOG ?? 'info' });

const puertoTcp = process.env.PUERTO_DC09_TCP ?? '9999';
const puertoUdp = process.env.PUERTO_DC09_UDP ?? '9999';

// Clave AES opcional: sin ella, las tramas cifradas se rechazan con NAK y quedan en el diario
const claveConfigurada = (process.env.DC09_CLAVE_AES ?? '').trim();
let claveAes: Buffer | undefined;
if (claveConfigurada) {
  const normalizada = normalizarClaveAes(claveConfigurada);
  if (!normalizada) {
    log.error('DC09_CLAVE_AES inválida: debe ser hexadecimal de 32, 48 o 64 caracteres. Se ignora.');
  } else {
    claveAes = normalizada;
    log.info({ bits: normalizada.length * 8 }, 'Descifrado AES de DC-09 habilitado');
  }
}

const servidorTcp = iniciarDc09Tcp(puertoTcp, log, claveAes);
const servidorUdp = iniciarDc09Udp(puertoUdp, log, claveAes);

// Escucha del receptor PIMA. Vacío = deshabilitado, para no abrir un puerto
// que nadie va a usar en instalaciones sin receptor serie.
const puertoPima = (process.env.PUERTO_PIMA_TCP ?? '').trim();
const servidorPima = puertoPima ? iniciarPimaTcp(puertoPima, log) : null;
const detenerVigilante = iniciarVigilante({
  alError: (err) => log.error({ err }, 'Error del vigilante de paneles'),
});

// Retención del diario crudo: sin RETENCION_SENALES_DIAS no se borra nada
const diasRetencion = Number(process.env.RETENCION_SENALES_DIAS ?? 0) || undefined;
const detenerDepuracion = iniciarDepuracionPeriodica({
  diasRetencion,
  alDepurar: (r) => log.info(r, 'Diario de señales depurado'),
  alError: (err) => log.error({ err }, 'Error al depurar el diario de señales'),
});
if (diasRetencion) log.info({ diasRetencion }, 'Depuración diaria del diario de señales habilitada');

log.info('Receptor de señales iniciado');

async function apagar(senalSo: string) {
  log.info({ senal: senalSo }, 'Apagando receptor');
  detenerVigilante();
  detenerDepuracion();
  servidorTcp.close();
  servidorPima?.close();
  servidorUdp.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));
