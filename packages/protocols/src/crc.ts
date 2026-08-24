/** CRC-16/ARC (polinomio 0xA001 reflejado, inicial 0x0000) — el CRC que exige SIA DC-09. */
export function crc16(datos: Buffer | string): number {
  const buf = typeof datos === 'string' ? Buffer.from(datos, 'latin1') : datos;
  let crc = 0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

export function crc16Hex(datos: Buffer | string): string {
  return crc16(datos).toString(16).toUpperCase().padStart(4, '0');
}
