import { describe, expect, it } from 'vitest';
import { describirTasa, usdABs } from '@monitoring/shared';

describe('moneda', () => {
  it('convierte al céntimo con la tasa del día', () => {
    expect(usdABs(25, 855.6625)).toBe(21391.56);
    expect(usdABs(0, 855.6625)).toBe(0);
  });
  it('describe la tasa con su fecha y su origen', () => {
    expect(describirTasa({ valor: 855.6625, fechaValor: '2026-09-25', fuente: 'bcv' })).toBe('Bs 855,66 por US$ (BCV 25/09/2026)');
    expect(describirTasa({ valor: 850, fechaValor: '2026-09-24', fuente: 'manual' })).toBe('Bs 850,00 por US$ (manual 24/09/2026)');
  });
});
