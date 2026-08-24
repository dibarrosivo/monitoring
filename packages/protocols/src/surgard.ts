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

export function parsearLineaSurgard(entrada: Buffer | string): ResultadoSurgard {
  const cruda = (typeof entrada === 'string' ? entrada : entrada.toString('latin1'))
    .replace(/[\r\n\x14]/g, '')
    .trimEnd();

  if (cruda.includes('@')) return { tipo: 'latido' };

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
