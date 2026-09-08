import { describe, expect, it } from 'vitest';
import {
  cifrarCampo,
  construirAck,
  construirTramaAdmCid,
  construirTramaAdmCidCifrada,
  descifrarHex,
  normalizarClaveAes,
  parsearDatosAdmCid,
  parsearTramaDc09,
  separarRelleno,
} from '@monitoring/protocols';

const CLAVE_128 = normalizarClaveAes('000102030405060708090A0B0C0D0E0F')!;
const CLAVE_256 = normalizarClaveAes('000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F')!;

describe('normalizarClaveAes', () => {
  it('acepta claves de 128, 192 y 256 bits en hexadecimal', () => {
    expect(normalizarClaveAes('00112233445566778899AABBCCDDEEFF')?.length).toBe(16);
    expect(normalizarClaveAes('00'.repeat(24))?.length).toBe(24);
    expect(normalizarClaveAes('00'.repeat(32))?.length).toBe(32);
  });

  it('rechaza longitudes y caracteres inválidos', () => {
    expect(normalizarClaveAes('00112233')).toBeNull();
    expect(normalizarClaveAes('ZZ'.repeat(16))).toBeNull();
    expect(normalizarClaveAes('')).toBeNull();
  });
});

describe('cifrarCampo / descifrarHex', () => {
  it('hace round-trip del campo de datos con la marca de tiempo', () => {
    const hex = cifrarCampo('#1234|1130 01 015', '_10:20:30,08-26-2026', CLAVE_128);
    expect(hex).toMatch(/^[0-9A-F]+$/);
    // El bloque cifrado siempre es múltiplo de 16 bytes (32 caracteres hex)
    expect(hex.length % 32).toBe(0);

    const plano = descifrarHex(hex, CLAVE_128)!;
    const separado = separarRelleno(plano)!;
    expect(separado.datos).toBe('#1234|1130 01 015');
    expect(separado.resto).toBe('_10:20:30,08-26-2026');
  });

  it('agrega relleno delante del contenido', () => {
    const hex = cifrarCampo('#1|1130 01 015', '', CLAVE_128);
    const plano = descifrarHex(hex, CLAVE_128)!;
    expect(plano.indexOf('[')).toBeGreaterThan(0);
  });

  it('funciona con clave de 256 bits', () => {
    const hex = cifrarCampo('#ABCD|3401 02 001', '', CLAVE_256);
    expect(separarRelleno(descifrarHex(hex, CLAVE_256)!)!.datos).toBe('#ABCD|3401 02 001');
  });

  it('devuelve null ante hexadecimal inválido o largo incorrecto', () => {
    expect(descifrarHex('ZZ', CLAVE_128)).toBeNull();
    expect(descifrarHex('00112233', CLAVE_128)).toBeNull();
    expect(descifrarHex('', CLAVE_128)).toBeNull();
  });
});

describe('parsearTramaDc09 con cifrado', () => {
  const marca = new Date(Date.UTC(2026, 7, 26, 14, 30, 15));

  it('descifra una trama ADM-CID cifrada con la clave correcta', () => {
    const trama = construirTramaAdmCidCifrada({
      cuenta: '1234',
      calificador: 1,
      codigoCid: '130',
      zona: '015',
      claveAes: CLAVE_128,
      marcaTiempo: marca,
    });
    const resultado = parsearTramaDc09(trama, { claveAes: CLAVE_128 });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.trama.cifrada).toBe(true);
    // El identificador queda normalizado: el receptor la procesa como cualquier ADM-CID
    expect(resultado.trama.id).toBe('ADM-CID');
    expect(resultado.trama.numeroCuenta).toBe('1234');
    expect(resultado.trama.datos).toBe('#1234|1130 01 015');
    expect(resultado.trama.marcaTiempo?.toISOString()).toBe('2026-08-26T14:30:15.000Z');

    // El evento decodificado sale igual que en una trama en claro
    const cid = parsearDatosAdmCid(resultado.trama.datos)!;
    expect(cid.codigoCid).toBe('130');
    expect(cid.zona).toBe('015');
  });

  it('rechaza la trama cifrada cuando no hay clave configurada', () => {
    const trama = construirTramaAdmCidCifrada({ cuenta: '1234', calificador: 1, codigoCid: '130', claveAes: CLAVE_128 });
    const resultado = parsearTramaDc09(trama);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toBe('trama-cifrada');
  });

  it('informa descifrado fallido con la clave equivocada', () => {
    const trama = construirTramaAdmCidCifrada({ cuenta: '1234', calificador: 1, codigoCid: '130', claveAes: CLAVE_128 });
    const otra = normalizarClaveAes('FF'.repeat(16))!;
    const resultado = parsearTramaDc09(trama, { claveAes: otra });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toBe('descifrado-fallido');
  });

  it('el ACK cifrado es legible con la misma clave', () => {
    const ack = construirAck({ secuencia: '0042', receptor: 'R0', linea: 'L0', numeroCuenta: '1234' }, CLAVE_128);
    expect(ack.toString('latin1')).toContain('"*ACK"');
    const resultado = parsearTramaDc09(ack, { claveAes: CLAVE_128 });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.trama.id).toBe('ACK');
    expect(resultado.trama.secuencia).toBe('0042');
  });

  it('el ACK en claro se mantiene sin clave', () => {
    const ack = construirAck({ secuencia: '0042', receptor: 'R0', linea: 'L0', numeroCuenta: '1234' });
    expect(ack.toString('latin1')).toContain('"ACK"');
    expect(ack.toString('latin1')).not.toContain('*');
  });

  it('sigue leyendo tramas en claro aunque haya clave configurada', () => {
    const trama = construirTramaAdmCid({ cuenta: '9999', calificador: 1, codigoCid: '602' });
    const resultado = parsearTramaDc09(trama, { claveAes: CLAVE_128 });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.trama.cifrada).toBe(false);
    expect(resultado.trama.datos).toBe('#9999|1602 01 000');
  });
});
