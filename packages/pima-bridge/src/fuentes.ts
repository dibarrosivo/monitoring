import net from 'node:net';
import { registrar } from './registro.js';
import type { Config } from './config.js';

/**
 * Origen de las tramas. El puente soporta dos:
 *  - 'serie': el puerto COM al que está conectado el receptor (el caso PIMA).
 *  - 'tcp'  : receptores con salida de red, y también el modo de prueba.
 *
 * En ambos casos entrega LÍNEAS crudas: el corte es por CR, LF o DC4 (0x14),
 * que es como terminan las tramas Sur-Gard.
 */

export interface Fuente {
  /** Envía el ACK (0x06) al receptor para que dé la trama por entregada */
  responder(byte: number): void;
  cerrar(): void;
}

const SEPARADORES = /[\r\n\x14]+/;

function crearAcumulador(alRecibirLinea: (linea: string) => void) {
  let resto = '';
  return (datos: Buffer) => {
    resto += datos.toString('latin1');
    const partes = resto.split(SEPARADORES);
    // El último fragmento puede estar incompleto: queda para la próxima lectura
    resto = partes.pop() ?? '';
    for (const parte of partes) {
      if (parte.trim()) alRecibirLinea(parte);
    }
    // Protección contra un flujo sin separadores
    if (resto.length > 4096) resto = '';
  };
}

/**
 * Carga serialport. En desarrollo entra por el import normal; dentro del
 * ejecutable empaquetado (SEA) el require embebido solo resuelve módulos
 * internos, así que se busca el paquete que viaja al lado del .exe.
 */
async function cargarSerialPort(): Promise<{
  SerialPort: (new (opciones: Record<string, unknown>) => any) & {
    list: () => Promise<
      { path: string; manufacturer?: string; friendlyName?: string; serialNumber?: string; pnpId?: string }[]
    >;
  };
}> {
  try {
    const { isSea } = await import('node:sea');
    if (isSea()) {
      const { createRequire } = await import('node:module');
      return createRequire(process.execPath)('serialport');
    }
  } catch {
    // node:sea no existe (Node viejo) o no estamos empaquetados: seguimos abajo
  }
  return import('serialport') as unknown as ReturnType<typeof cargarSerialPort>;
}

export async function abrirFuenteSerie(config: Config, alRecibirLinea: (linea: string) => void): Promise<Fuente> {
  const { SerialPort } = await cargarSerialPort();
  const puerto = new SerialPort({
    path: config.puertoSerie,
    baudRate: config.baudios,
    dataBits: config.dataBits,
    parity: config.parity,
    stopBits: config.stopBits,
    autoOpen: false,
  });

  await new Promise<void>((resolver, rechazar) => {
    puerto.open((err: Error | null) => (err ? rechazar(err) : resolver()));
  });

  registrar('info', 'Puerto serie abierto', {
    puerto: config.puertoSerie,
    baudios: config.baudios,
    paridad: config.parity,
  });

  puerto.on('data', crearAcumulador(alRecibirLinea));
  puerto.on('error', (err: Error) => registrar('error', 'Error del puerto serie', { error: err.message }));
  puerto.on('close', () => registrar('warn', 'El puerto serie se cerró'));

  return {
    responder: (byte) => puerto.write(Buffer.from([byte])),
    cerrar: () => puerto.close(() => {}),
  };
}

export function abrirFuenteTcp(config: Config, alRecibirLinea: (linea: string) => void): Fuente {
  let socket: net.Socket | null = null;
  let cerrado = false;
  const acumular = crearAcumulador(alRecibirLinea);

  function conectar() {
    socket = net.createConnection({ host: config.tcpHost, port: config.tcpPuerto }, () =>
      registrar('info', 'Conectado al receptor por TCP', { host: config.tcpHost, puerto: config.tcpPuerto }),
    );
    socket.on('data', acumular);
    socket.on('error', (err) => registrar('warn', 'Error de la conexión TCP', { error: err.message }));
    socket.on('close', () => {
      if (cerrado) return;
      registrar('warn', 'Conexión TCP caída: reintentando en 5 s');
      setTimeout(conectar, 5000);
    });
  }
  conectar();

  return {
    responder: (byte) => socket?.write(Buffer.from([byte])),
    cerrar: () => {
      cerrado = true;
      socket?.destroy();
    },
  };
}


/**
 * Puertos serie que ve la PC, con su descripción. Es la forma de averiguar en
 * cuál está el receptor sin abrir el Administrador de dispositivos.
 */
export async function listarPuertosSerie(): Promise<
  { puerto: string; descripcion: string }[]
> {
  const { SerialPort } = await cargarSerialPort();
  const puertos = await SerialPort.list();
  return puertos.map((p) => ({
    puerto: p.path,
    descripcion: [p.friendlyName ?? p.manufacturer, p.serialNumber && `S/N ${p.serialNumber}`]
      .filter(Boolean)
      .join(' · '),
  }));
}
