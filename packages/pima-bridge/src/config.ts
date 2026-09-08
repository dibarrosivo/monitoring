/**
 * Configuración del puente. Todo por variables de entorno (archivo .env junto
 * al programa), para que en la PC de la central se edite un solo archivo.
 */

export interface Config {
  /** Identificador de este puente ante el servidor */
  nombre: string;
  servidor: string;
  token: string;
  /** 'serie' lee un puerto COM; 'tcp' se conecta a un receptor con salida de red */
  fuente: 'serie' | 'tcp';
  puertoSerie: string;
  baudios: number;
  dataBits: 5 | 6 | 7 | 8;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  stopBits: 1 | 2;
  tcpHost: string;
  tcpPuerto: number;
  /** Responder ACK (0x06) al receptor tras guardar la trama */
  responderAck: boolean;
  intervaloLatidoSeg: number;
  /** Archivo de cola: sobrevive a cortes de red y reinicios */
  archivoCola: string;
  nivelLog: 'debug' | 'info' | 'warn' | 'error';
}

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export function leerConfig(): Config {
  const fuente = (process.env.BRIDGE_FUENTE ?? 'serie').toLowerCase() === 'tcp' ? 'tcp' : 'serie';
  return {
    nombre: process.env.BRIDGE_NOMBRE ?? 'puente-central',
    servidor: (process.env.BRIDGE_SERVIDOR ?? 'http://localhost:3000').replace(/\/+$/, ''),
    token: process.env.BRIDGE_TOKEN ?? '',
    fuente,
    puertoSerie: process.env.BRIDGE_PUERTO_SERIE ?? 'COM1',
    baudios: entero(process.env.BRIDGE_BAUDIOS, 9600),
    dataBits: entero(process.env.BRIDGE_DATA_BITS, 8) as 8,
    parity: (process.env.BRIDGE_PARIDAD ?? 'none') as Config['parity'],
    stopBits: entero(process.env.BRIDGE_STOP_BITS, 1) as 1,
    tcpHost: process.env.BRIDGE_TCP_HOST ?? '127.0.0.1',
    tcpPuerto: entero(process.env.BRIDGE_TCP_PUERTO, 10001),
    responderAck: (process.env.BRIDGE_ACK ?? 'si').toLowerCase() !== 'no',
    intervaloLatidoSeg: entero(process.env.BRIDGE_LATIDO_SEG, 60),
    archivoCola: process.env.BRIDGE_ARCHIVO_COLA ?? 'cola-pendiente.jsonl',
    nivelLog: (process.env.BRIDGE_NIVEL_LOG ?? 'info') as Config['nivelLog'],
  };
}
