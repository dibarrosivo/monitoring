import type { Logger } from 'pino';
import { registrarSenal } from '@monitoring/engine';
import type { FuenteSenal } from '@monitoring/shared';

/**
 * Tráfico ajeno: los puertos del receptor están en internet y los escáneres
 * los prueban con lo que sea (HTTP, TLS, SIP, Redis, SSH). Nada de eso es
 * una alarma y no merece una fila por línea en el diario. Se reconoce por
 * los primeros bytes de la conexión, se guarda UNA trama por origen y hora
 * como "escaneo de internet", y se corta.
 */

const FIRMAS: [RegExp, string][] = [
  [/^(GET|POST|HEAD|PUT|DELETE|OPTIONS|PATCH|CONNECT|PRI) \S+ (HTTP|RTSP)\//, 'petición HTTP'],
  [/^(GET|POST|HEAD|PUT|DELETE|OPTIONS|PATCH|CONNECT|PRI) [\/*]/, 'petición HTTP'],
  [/^(INVITE|REGISTER|OPTIONS|SUBSCRIBE|NOTIFY|ACK|BYE) sip:/i, 'sondeo SIP'],
  [/^(DESCRIBE|SETUP|PLAY|TEARDOWN) rtsp:/i, 'sondeo RTSP'],
  [/^\*\d+\r\n\$\d+\r\n/, 'sondeo Redis'],
  [/^(PING|INFO|CONFIG|CLIENT)\r\n/, 'sondeo Redis'],
  [/^SSH-\d/, 'sondeo SSH'],
  [/^\x16\x03[\x00-\x03]/, 'saludo TLS'],
  [/^\x05[\x01-\x03]/, 'sondeo SOCKS'],
  [/^(EHLO|HELO|STARTTLS|QUIT)\b/i, 'sondeo SMTP'],
  [/^(PING|version|help|stats)\r?\n/i, 'sondeo genérico'],
  [/^ZBXD/, 'sondeo Zabbix'],
  [/^<\?xml|^<policy-file-request/i, 'sondeo XML'],
];

/** Motivo por el que estos bytes no son de un panel, o null si podrían serlo. */
export function esTraficoAjeno(datos: Buffer | string): string | null {
  const texto = (typeof datos === 'string' ? datos : datos.toString('latin1')).slice(0, 64);
  for (const [firma, motivo] of FIRMAS) if (firma.test(texto)) return motivo;
  return null;
}

/** Un registro por origen cada hora: alcanza para saber que pasa, sin llenar el diario. */
const VENTANA_MS = 3_600_000;
const ultimoRegistro = new Map<string, number>();

export async function registrarEscaneo(entrada: { fuente: FuenteSenal; remoto: string; motivo: string; datos: Buffer | string; log: Logger }): Promise<void> {
  const ip = entrada.remoto.replace(/:\d+$/, '');
  const clave = `${entrada.fuente}|${ip}`;
  const ahora = Date.now();
  if (ahora - (ultimoRegistro.get(clave) ?? 0) < VENTANA_MS) return;
  ultimoRegistro.set(clave, ahora);
  if (ultimoRegistro.size > 5000) ultimoRegistro.clear();
  const muestra = (typeof entrada.datos === 'string' ? entrada.datos : entrada.datos.toString('latin1')).slice(0, 80).replace(/[\r\n]+/g, ' ');
  entrada.log.info({ remoto: entrada.remoto, motivo: entrada.motivo }, 'Tráfico ajeno al receptor, descartado');
  await registrarSenal({
    fuente: entrada.fuente,
    remoto: entrada.remoto,
    cruda: muestra,
    estadoParse: 'ignorada',
    detalleError: `escaneo de internet: ${entrada.motivo}`,
  });
}
