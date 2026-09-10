import { describe, expect, it } from 'vitest';
import { parsearLineaPima, parsearLineaSurgard } from '../src/surgard.js';

/** Tramas capturadas del tráfico real de la central el 10 de septiembre de 2026. */

// "1061      7002    TH" + DC4, tal cual salió del cable
const TRAMA_REAL = Buffer.from([
  0x31, 0x30, 0x36, 0x31, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x37, 0x30, 0x30, 0x32, 0x20, 0x20,
  0x20, 0x20, 0x54, 0x48, 0x14,
]);

describe('formato real del receptor PIMA', () => {
  it('reconoce la trama capturada byte por byte', () => {
    expect(parsearLineaPima(TRAMA_REAL)).toEqual({
      prefijo: '1061',
      numeroCuenta: '7002',
      codigo: 'TH',
    });
  });

  it('el terminador DC4 no forma parte del código', () => {
    expect(parsearLineaPima(TRAMA_REAL)?.codigo).toBe('TH');
  });

  it.each([
    ['1061      7065    TH', '1061', '7065', 'TH'],
    ['1061      7079    QS', '1061', '7079', 'QS'],
    ['1001      8000    01', '1001', '8000', '01'],
    ['1001      8000    02', '1001', '8000', '02'],
  ])('reconoce %s', (linea, prefijo, cuenta, codigo) => {
    expect(parsearLineaPima(linea)).toEqual({ prefijo, numeroCuenta: cuenta, codigo });
  });

  it('no confunde una línea Sur-Gard clásica con el formato PIMA', () => {
    expect(parsearLineaPima('5011234181130001015')).toBeNull();
  });

  it('el analizador Sur-Gard clásico no reconocía esta trama', () => {
    // Es el motivo por el que existe parsearLineaPima: el formato real del
    // receptor no lleva el separador '18' ni un código Contact ID de 3 dígitos.
    expect(parsearLineaSurgard(TRAMA_REAL).tipo).toBe('desconocido');
  });
});
