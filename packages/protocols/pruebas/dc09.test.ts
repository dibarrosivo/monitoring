import { describe, expect, it } from 'vitest';
import {
  construirAck,
  construirNak,
  construirTramaAdmCid,
  construirTramaNull,
  crc16,
  parsearDatosAdmCid,
  parsearTramaDc09,
} from '@monitoring/protocols';

describe('crc16 (CRC-16/ARC)', () => {
  it('coincide con el vector de prueba estándar', () => {
    expect(crc16('123456789')).toBe(0xbb3d);
  });
});

describe('parsearTramaDc09', () => {
  it('hace round-trip con una trama ADM-CID construida', () => {
    const trama = construirTramaAdmCid({
      cuenta: '1234',
      calificador: 1,
      codigoCid: '130',
      particion: '01',
      zona: '015',
      secuencia: '0007',
      marcaTiempo: new Date(Date.UTC(2026, 7, 24, 14, 59, 59)),
    });
    const resultado = parsearTramaDc09(trama);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.trama.id).toBe('ADM-CID');
    expect(resultado.trama.secuencia).toBe('0007');
    expect(resultado.trama.numeroCuenta).toBe('1234');
    expect(resultado.trama.datos).toBe('#1234|1130 01 015');
    expect(resultado.trama.marcaTiempo?.toISOString()).toBe('2026-08-24T14:59:59.000Z');
  });

  it('rechaza una trama con CRC alterado', () => {
    const trama = construirTramaAdmCid({ cuenta: '1234', calificador: 1, codigoCid: '130' }).toString('latin1');
    // Alterar un carácter del cuerpo invalida el CRC
    const corrupta = trama.replace('|1130', '|1131');
    const resultado = parsearTramaDc09(corrupta);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toBe('crc-invalido');
  });

  it('reconoce la trama NULL de supervisión', () => {
    const resultado = parsearTramaDc09(construirTramaNull({ cuenta: 'ABC123' }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.trama.id).toBe('NULL');
    expect(resultado.trama.numeroCuenta).toBe('ABC123');
  });

  it('rechaza tramas cifradas con un error claro', () => {
    // Una trama "*ADM-CID" bien formada (CRC correcto) debe reportar trama-cifrada
    const base = construirTramaAdmCid({ cuenta: '9999', calificador: 1, codigoCid: '602' }).toString('latin1');
    const mensaje = base.slice(9, -1).replace('"ADM-CID"', '"*ADM-CID"');
    const crc = crc16(mensaje).toString(16).toUpperCase().padStart(4, '0');
    const longitud = mensaje.length.toString(16).toUpperCase().padStart(3, '0');
    const resultado = parsearTramaDc09(`\n${crc}0${longitud}${mensaje}\r`);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toBe('trama-cifrada');
  });

  it('el ACK construido es una trama DC-09 válida con la misma secuencia', () => {
    const ack = construirAck({ secuencia: '0042', receptor: 'R0', linea: 'L0', numeroCuenta: '1234' });
    const resultado = parsearTramaDc09(ack);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.trama.id).toBe('ACK');
    expect(resultado.trama.secuencia).toBe('0042');
  });

  it('el NAK construido es una trama DC-09 válida con marca de tiempo', () => {
    const nak = construirNak(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));
    const resultado = parsearTramaDc09(nak);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.trama.id).toBe('NAK');
    expect(resultado.trama.marcaTiempo?.toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('parsearDatosAdmCid', () => {
  it('parsea datos con espacios', () => {
    expect(parsearDatosAdmCid('#1234|1130 01 015')).toEqual({
      cuentaEnDatos: '1234',
      calificador: 1,
      codigoCid: '130',
      particion: '01',
      zona: '015',
    });
  });

  it('parsea datos sin espacios y con restauración', () => {
    expect(parsearDatosAdmCid('#ABCD|340102015')).toEqual({
      cuentaEnDatos: 'ABCD',
      calificador: 3,
      codigoCid: '401',
      particion: '02',
      zona: '015',
    });
  });

  it('devuelve null ante datos no reconocidos', () => {
    expect(parsearDatosAdmCid('basura')).toBeNull();
    expect(parsearDatosAdmCid('#1234|9130 01 015')).toBeNull(); // calificador inválido
  });
});
