import { crc16Hex } from './crc.js';
import { cifrarCampo, descifrarHex, separarRelleno } from './cifrado.js';

/**
 * SIA DC-09: transporte de eventos de alarma sobre TCP/UDP.
 * Trama: <LF><CRC:4hex><0LLL:longitud><"ID"><seq:4><Rrcvr><Lline>#cuenta[datos]...<marca de tiempo><CR>
 * El CRC y la longitud se calculan sobre el cuerpo que empieza en la comilla del ID.
 */

export interface TramaDc09 {
  /** 'ADM-CID' (Contact ID), 'SIA-DCS', 'NULL' (supervisión), etc. */
  id: string;
  cifrada: boolean;
  secuencia: string;
  receptor: string;
  linea: string;
  numeroCuenta: string;
  /** Contenido entre corchetes, sin decodificar */
  datos: string;
  /** Marca de tiempo de la trama si vino (el estándar la define en GMT) */
  marcaTiempo?: Date;
}

export type ResultadoParseDc09 =
  | { ok: true; trama: TramaDc09 }
  | {
      ok: false;
      error: 'trama-invalida' | 'crc-invalido' | 'longitud-invalida' | 'trama-cifrada' | 'descifrado-fallido';
      detalle?: string;
    };

export interface OpcionesParseDc09 {
  /** Clave AES ya normalizada (16, 24 o 32 bytes). Sin clave, las tramas cifradas se rechazan. */
  claveAes?: Buffer;
}

// El número de cuenta es opcional: las respuestas NAK no lo llevan.
const RE_MENSAJE = /^"(\*?[A-Za-z0-9-]+)"(\d{4})(R[0-9A-Fa-f]{1,6})?(L[0-9A-Fa-f]{1,6})(?:#([0-9A-Fa-f]+))?\[([^\]]*)\](.*)$/s;
const RE_MARCA = /_(\d{2}):(\d{2}):(\d{2}),(\d{2})-(\d{2})-(\d{4})/;

export function parsearTramaDc09(entrada: Buffer | string, opciones: OpcionesParseDc09 = {}): ResultadoParseDc09 {
  let cuerpo = typeof entrada === 'string' ? entrada : entrada.toString('latin1');
  cuerpo = cuerpo.replace(/^\n/, '').replace(/\r$/, '');
  if (cuerpo.length < 9) return { ok: false, error: 'trama-invalida', detalle: 'muy corta' };

  const crcRecibido = cuerpo.slice(0, 4).toUpperCase();
  const campoLongitud = cuerpo.slice(4, 8);
  const mensaje = cuerpo.slice(8);

  if (crc16Hex(mensaje) !== crcRecibido) {
    return { ok: false, error: 'crc-invalido', detalle: `esperado ${crc16Hex(mensaje)}, recibido ${crcRecibido}` };
  }
  const longitudDeclarada = parseInt(campoLongitud, 16);
  if (Number.isNaN(longitudDeclarada) || longitudDeclarada !== mensaje.length) {
    return { ok: false, error: 'longitud-invalida', detalle: `declarada ${campoLongitud}, real ${mensaje.length}` };
  }

  const m = RE_MENSAJE.exec(mensaje);
  if (!m) return { ok: false, error: 'trama-invalida', detalle: 'cuerpo no reconocido' };

  const [, idCrudo, secuencia, receptor, linea, numeroCuenta] = m;
  let datos = m[6] ?? '';
  let resto = m[7] ?? '';
  const cifrada = idCrudo!.startsWith('*');
  // Tras descifrar, el identificador se normaliza sin '*': el resto del sistema
  // trata la trama como cualquier ADM-CID y `cifrada` deja constancia del origen.
  const id = cifrada ? idCrudo!.slice(1) : idCrudo!;

  if (cifrada) {
    if (!opciones.claveAes) {
      return { ok: false, error: 'trama-cifrada', detalle: `${idCrudo} (sin clave AES configurada)` };
    }
    const textoPlano = descifrarHex(datos, opciones.claveAes);
    if (textoPlano === null) {
      return { ok: false, error: 'descifrado-fallido', detalle: 'el campo cifrado no es un bloque AES válido' };
    }
    const separado = separarRelleno(textoPlano);
    // Con la clave equivocada sale basura: puede traer un '[' y un ']' por
    // casualidad, pero no va a ser texto ASCII imprimible de punta a punta.
    if (!separado || !/^[\x20-\x7E]*$/.test(separado.datos) || !/^[\x20-\x7E]*$/.test(separado.resto)) {
      return { ok: false, error: 'descifrado-fallido', detalle: 'clave incorrecta o relleno no reconocido' };
    }
    datos = separado.datos;
    resto = separado.resto;
  }

  let marcaTiempo: Date | undefined;
  const mt = RE_MARCA.exec(resto ?? '');
  if (mt) {
    const [, hh, mm, ss, mes, dia, anio] = mt;
    // El estándar define la marca en GMT; se guarda como referencia, la hora canónica es la de recepción.
    marcaTiempo = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia), Number(hh), Number(mm), Number(ss)));
  }

  return {
    ok: true,
    trama: {
      id,
      cifrada,
      secuencia: secuencia!,
      receptor: receptor ?? '',
      linea: linea!,
      numeroCuenta: numeroCuenta ?? '',
      datos: datos ?? '',
      marcaTiempo,
    },
  };
}

/** Datos ADM-CID: "#cuenta|QEEE GG ZZZ" (los espacios son opcionales según el panel). */
export interface DatosAdmCid {
  cuentaEnDatos: string;
  calificador: 1 | 3 | 6;
  codigoCid: string;
  particion: string;
  zona: string;
}

const RE_ADM_CID = /^#?([0-9A-Fa-f]*)\|([136])(\d{3})\s?(\d{2})\s?(\d{3})\s*$/;

export function parsearDatosAdmCid(datos: string): DatosAdmCid | null {
  const m = RE_ADM_CID.exec(datos);
  if (!m) return null;
  const [, cuenta, calificador, codigo, particion, zona] = m;
  return {
    cuentaEnDatos: cuenta ?? '',
    calificador: Number(calificador) as 1 | 3 | 6,
    codigoCid: codigo!,
    particion: particion!,
    zona: zona!,
  };
}

function envolver(mensaje: string): string {
  const longitud = mensaje.length.toString(16).toUpperCase().padStart(3, '0');
  return `\n${crc16Hex(mensaje)}0${longitud}${mensaje}\r`;
}

function marcaGmt(fecha: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `_${p(fecha.getUTCHours())}:${p(fecha.getUTCMinutes())}:${p(fecha.getUTCSeconds())},${p(fecha.getUTCMonth() + 1)}-${p(fecha.getUTCDate())}-${fecha.getUTCFullYear()}`;
}

/**
 * Respuesta positiva: el panel da el evento por entregado. Si la trama llegó
 * cifrada, el estándar pide responder también cifrada ("*ACK"), así que se
 * pasa la clave usada para descifrarla.
 */
export function construirAck(
  trama: Pick<TramaDc09, 'secuencia' | 'receptor' | 'linea' | 'numeroCuenta'>,
  claveAes?: Buffer,
): Buffer {
  const cabecera = `${trama.secuencia}${trama.receptor}${trama.linea}#${trama.numeroCuenta}`;
  const mensaje = claveAes
    ? `"*ACK"${cabecera}[${cifrarCampo('', marcaGmt(new Date()), claveAes)}]`
    : `"ACK"${cabecera}[]`;
  return Buffer.from(envolver(mensaje), 'latin1');
}

/** Respuesta negativa: el panel reintentará. Incluye marca de tiempo GMT según el estándar. */
export function construirNak(fecha: Date = new Date()): Buffer {
  const mensaje = `"NAK"0000R0L0[]${marcaGmt(fecha)}`;
  return Buffer.from(envolver(mensaje), 'latin1');
}

/** Construye una trama ADM-CID válida (para el simulador y las pruebas). */
export function construirTramaAdmCid(opciones: {
  cuenta: string;
  calificador: 1 | 3 | 6;
  codigoCid: string;
  particion?: string;
  zona?: string;
  secuencia?: string;
  receptor?: string;
  linea?: string;
  marcaTiempo?: Date;
}): Buffer {
  const {
    cuenta,
    calificador,
    codigoCid,
    particion = '01',
    zona = '000',
    secuencia = '0001',
    receptor = 'R0',
    linea = 'L0',
    marcaTiempo,
  } = opciones;
  const datos = `#${cuenta}|${calificador}${codigoCid} ${particion} ${zona}`;
  const sufijo = marcaTiempo ? marcaGmt(marcaTiempo) : '';
  const mensaje = `"ADM-CID"${secuencia}${receptor}${linea}#${cuenta}[${datos}]${sufijo}`;
  return Buffer.from(envolver(mensaje), 'latin1');
}

/**
 * Igual que construirTramaAdmCid pero con el campo de datos cifrado (AES-CBC)
 * y el identificador prefijado con '*', como transmite un panel con cifrado
 * activado. La marca de tiempo viaja dentro del bloque cifrado.
 */
export function construirTramaAdmCidCifrada(opciones: {
  cuenta: string;
  calificador: 1 | 3 | 6;
  codigoCid: string;
  claveAes: Buffer;
  particion?: string;
  zona?: string;
  secuencia?: string;
  receptor?: string;
  linea?: string;
  marcaTiempo?: Date;
}): Buffer {
  const {
    cuenta,
    calificador,
    codigoCid,
    claveAes,
    particion = '01',
    zona = '000',
    secuencia = '0001',
    receptor = 'R0',
    linea = 'L0',
    marcaTiempo,
  } = opciones;
  const datos = `#${cuenta}|${calificador}${codigoCid} ${particion} ${zona}`;
  const cifrado = cifrarCampo(datos, marcaTiempo ? marcaGmt(marcaTiempo) : '', claveAes);
  const mensaje = `"*ADM-CID"${secuencia}${receptor}${linea}#${cuenta}[${cifrado}]`;
  return Buffer.from(envolver(mensaje), 'latin1');
}

/** Trama NULL de supervisión (latido) — también para el simulador. */
export function construirTramaNull(opciones: { cuenta: string; secuencia?: string; receptor?: string; linea?: string }): Buffer {
  const { cuenta, secuencia = '0001', receptor = 'R0', linea = 'L0' } = opciones;
  const mensaje = `"NULL"${secuencia}${receptor}${linea}#${cuenta}[]`;
  return Buffer.from(envolver(mensaje), 'latin1');
}
