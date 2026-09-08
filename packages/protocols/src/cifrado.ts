import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado AES de SIA DC-09.
 *
 * El estándar cifra el campo de datos con AES-CBC (clave de 128, 192 o 256
 * bits) y lo transmite en hexadecimal dentro de los corchetes, con el
 * identificador prefijado por '*' (p. ej. "*ADM-CID"). El texto en claro
 * lleva relleno aleatorio ADELANTE para completar el múltiplo de 16 bytes;
 * el contenido real arranca en el '[' del campo de datos.
 *
 * PENDIENTE DE VERIFICACIÓN CON PANEL REAL: el vector de inicialización en
 * cero y la convención de relleno están tomados del estándar y de las
 * implementaciones habituales, pero no se probaron todavía contra un
 * Hikvision. Toda trama que no se pueda descifrar queda igual en el diario
 * crudo (`senal`), así que el ajuste fino se hace con datos reales.
 */

const IV_CERO = Buffer.alloc(16, 0);
const TAMANO_BLOQUE = 16;

/** Caracteres del relleno: se excluyen '[' , ']' y '|' para no confundir al separar. */
const ALFABETO_RELLENO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Acepta la clave en hexadecimal (32, 48 o 64 caracteres) y devuelve sus bytes. */
export function normalizarClaveAes(clave: string): Buffer | null {
  const limpia = clave.trim().replace(/\s+/g, '');
  if (!/^[0-9A-Fa-f]+$/.test(limpia)) return null;
  if (![32, 48, 64].includes(limpia.length)) return null;
  return Buffer.from(limpia, 'hex');
}

function algoritmo(clave: Buffer): string {
  return `aes-${clave.length * 8}-cbc`;
}

/** Descifra el hexadecimal del campo de datos y devuelve el texto en claro completo (con relleno). */
export function descifrarHex(hex: string, clave: Buffer): string | null {
  const limpio = hex.trim();
  if (!/^[0-9A-Fa-f]+$/.test(limpio) || limpio.length % (TAMANO_BLOQUE * 2) !== 0 || limpio.length === 0) {
    return null;
  }
  try {
    const descifrador = createDecipheriv(algoritmo(clave), clave, IV_CERO);
    descifrador.setAutoPadding(false);
    return Buffer.concat([descifrador.update(Buffer.from(limpio, 'hex')), descifrador.final()]).toString('latin1');
  } catch {
    return null;
  }
}

/**
 * Separa el relleno del contenido real: se busca el cierre ']' y, hacia atrás,
 * el '[' que lo abre. Así el relleno puede contener cualquier carácter sin
 * romper la separación.
 */
export function separarRelleno(textoPlano: string): { datos: string; resto: string } | null {
  const cierre = textoPlano.indexOf(']');
  if (cierre === -1) return null;
  const apertura = textoPlano.lastIndexOf('[', cierre);
  if (apertura === -1) return null;
  return {
    datos: textoPlano.slice(apertura + 1, cierre),
    // El resto lleva la marca de tiempo; se corta en el primer nulo de relleno final si lo hubiera
    resto: textoPlano.slice(cierre + 1).replace(/\0+$/, ''),
  };
}

/** Cifra un campo de datos con el relleno aleatorio adelante (para el simulador y las pruebas). */
export function cifrarCampo(datos: string, resto: string, clave: Buffer): string {
  const contenido = `[${datos}]${resto}`;
  const faltan = (TAMANO_BLOQUE - (contenido.length % TAMANO_BLOQUE)) % TAMANO_BLOQUE;
  // El estándar exige relleno delante, nunca menos de un bloque cuando ya calza justo
  const largoRelleno = faltan === 0 ? TAMANO_BLOQUE : faltan;
  const aleatorio = randomBytes(largoRelleno);
  let relleno = '';
  for (const byte of aleatorio) relleno += ALFABETO_RELLENO[byte % ALFABETO_RELLENO.length];

  const cifrador = createCipheriv(algoritmo(clave), clave, IV_CERO);
  cifrador.setAutoPadding(false);
  const textoPlano = Buffer.from(relleno + contenido, 'latin1');
  return Buffer.concat([cifrador.update(textoPlano), cifrador.final()]).toString('hex').toUpperCase();
}
