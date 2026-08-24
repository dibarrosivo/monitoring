import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Hash de claves con scrypt (node:crypto, sin dependencias nativas). Formato: scrypt:sal:hash */
export function hashearClave(clave: string): string {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(clave, sal, 64).toString('hex');
  return `scrypt:${sal}:${hash}`;
}

export function verificarClave(clave: string, guardado: string): boolean {
  const [esquema, sal, hash] = guardado.split(':');
  if (esquema !== 'scrypt' || !sal || !hash) return false;
  const calculado = scryptSync(clave, sal, 64);
  const original = Buffer.from(hash, 'hex');
  return calculado.length === original.length && timingSafeEqual(calculado, original);
}
