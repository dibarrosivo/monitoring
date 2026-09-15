/**
 * Formato Sur-Gard (MLR2): el formato clásico con el que los receptores de central
 * (incluidos los PIMA) entregan eventos al software de automatización por serie.
 *
 * IMPORTANTE: escrito a partir del formato Sur-Gard estándar. Hay que verificarlo
 * contra la salida real del receptor PIMA en cuanto el bridge capture tramas
 * (el bridge guarda todo crudo, así que no se pierde nada mientras tanto).
 *
 * Línea CID típica: S RR L AAAA 18 Q EEE GG ZZZ  (terminada en DC4 0x14 o CR)
 * Latido: línea con '@' que el receptor envía periódicamente; espera ACK 0x06.
 */

export const ACK_SERIE = 0x06;
export const DC4 = 0x14;

export type ResultadoSurgard =
  | { tipo: 'latido' }
  | {
      tipo: 'cid';
      receptor: string;
      linea: string;
      numeroCuenta: string;
      calificador: 1 | 3 | 6;
      codigoCid: string;
      particion: string;
      zona: string;
      /** true si se reconoció con el patrón de reserva y conviene verificar el formato */
      parseLaxo: boolean;
    }
  | { tipo: 'desconocido'; cruda: string };

const RE_PRINCIPAL = /^([0-9A-F])(\d{2})(\d)(\d{4})\s*18\s*([136])(\d{3})(\d{2})(\d{3})\s*$/;
const RE_RESERVA = /(\d{4})\s*18\s*([136])(\d{3})\s?(\d{2})\s?(\d{3})/;

/**
 * Variante con calificador de letra (Ademco 685 / MLR2 por red), que es la que
 * entregan los receptores por IP. Verificada el 15 de septiembre de 2026 contra
 * lo que reciben en la central de dos fuentes distintas:
 *
 *   "5011 187037E13001004"     receptor EBS OSM: cuenta 7037, nuevo E130, zona 4
 *   "501001 187037R30100000"   Hik IP Receiver: cuenta 7037, restaura R301
 *
 * La cabecera empieza en 5 y su largo varía según el receptor; después van el
 * "18" (Contact ID), la cuenta, la letra (E nuevo, R restauración, P previo),
 * el código, la partición y la zona. Sin espacio antes de la cuenta, a
 * diferencia del formato serie.
 */
const RE_LETRA = /^5(\d{2,5})\s*18(\d{4})([ERP])(\d{3})(\d{2})(\d{3})\s*$/;
const CALIFICADOR_LETRA: Record<string, 1 | 3 | 6> = { E: 1, R: 3, P: 6 };

/** Una trama MLR2 con letra, sin anclas: para detectar varias pegadas. */
const RE_LETRA_SUELTA = /5\d{2,5}\s*18\d{4}[ERP]\d{3}\d{2}\d{3}/g;

/**
 * Separa tramas que llegaron pegadas sin terminador entre ellas. Pasa cuando el
 * receptor retransmite lo no confirmado y el software de automatización lee
 * todo de una vez: en la central se vieron seis copias de la misma trama en
 * una sola línea. Si el texto no es exactamente una sucesión de tramas
 * válidas, se devuelve entero, para no inventar cortes.
 */
export function separarTramasPegadas(texto: string): string[] {
  const limpio = texto.replace(/[\r\n\x14]/g, '');
  const partes = limpio.match(RE_LETRA_SUELTA);
  if (!partes || partes.length < 2) return [texto];
  // Entre trama y trama puede haber espacios o nada; cualquier otra cosa invalida el corte
  const sinEspaciosEntre = limpio.replace(/\s+(?=5\d{2,5}\s*18)/g, '');
  return partes.join('') === sinEspaciosEntre ? partes : [texto];
}

export function parsearLineaSurgard(entrada: Buffer | string): ResultadoSurgard {
  const cruda = (typeof entrada === 'string' ? entrada : entrada.toString('latin1'))
    .replace(/[\r\n\x14]/g, '')
    .trimEnd();

  if (cruda.includes('@')) return { tipo: 'latido' };

  const l = RE_LETRA.exec(cruda.trim());
  if (l) {
    const [, cabecera, cuenta, letra, codigo, particion, zona] = l;
    return {
      tipo: 'cid',
      receptor: cabecera!.slice(0, 2),
      linea: cabecera!.slice(2),
      numeroCuenta: cuenta!,
      calificador: CALIFICADOR_LETRA[letra!]!,
      codigoCid: codigo!,
      particion: particion!,
      zona: zona!,
      parseLaxo: false,
    };
  }

  const m = RE_PRINCIPAL.exec(cruda.trim());
  if (m) {
    const [, , receptor, linea, cuenta, calificador, codigo, particion, zona] = m;
    return {
      tipo: 'cid',
      receptor: receptor!,
      linea: linea!,
      numeroCuenta: cuenta!,
      calificador: Number(calificador) as 1 | 3 | 6,
      codigoCid: codigo!,
      particion: particion!,
      zona: zona!,
      parseLaxo: false,
    };
  }

  const r = RE_RESERVA.exec(cruda);
  if (r) {
    const [, cuenta, calificador, codigo, particion, zona] = r;
    return {
      tipo: 'cid',
      receptor: '',
      linea: '',
      numeroCuenta: cuenta!,
      calificador: Number(calificador) as 1 | 3 | 6,
      codigoCid: codigo!,
      particion: particion!,
      zona: zona!,
      parseLaxo: true,
    };
  }

  return { tipo: 'desconocido', cruda };
}

/**
 * Formato real que entrega el receptor PIMA a través del puente serie, verificado
 * el 10 de septiembre de 2026 contra el tráfico en vivo de la central:
 *
 *   "1061      7002    TH" + DC4      (prefijo, cuenta, código de 2 caracteres)
 *    PPPP······AAAA····CC
 *
 * Cuatro caracteres de prefijo (identifica receptor y línea), seis espacios,
 * cuatro de número de cuenta, cuatro espacios y dos de código de evento.
 * A diferencia del Sur-Gard clásico no lleva el separador '18' ni un código
 * Contact ID de tres dígitos: usa una tabla propia de dos caracteres.
 */
export interface LineaPima {
  /** Identificador de receptor y línea, p. ej. '1061' */
  prefijo: string;
  numeroCuenta: string;
  /** Código de evento de dos caracteres, p. ej. 'TH', 'QS', 'SW' */
  codigo: string;
}

const RE_PIMA = /^(\S{2,6})\s+(\d{3,6})\s+([A-Z0-9]{2})$/;

/**
 * Reconoce el formato de dos caracteres del receptor PIMA. Devuelve null si la
 * línea no encaja, para que quien llame pruebe con el Sur-Gard clásico.
 */
export function parsearLineaPima(entrada: Buffer | string): LineaPima | null {
  const cruda = (typeof entrada === 'string' ? entrada : entrada.toString('latin1'))
    .replace(/[\r\n\x14]/g, '')
    .trim();

  const m = RE_PIMA.exec(cruda);
  if (!m) return null;
  return { prefijo: m[1]!, numeroCuenta: m[2]!, codigo: m[3]! };
}
