import { describe, expect, it } from 'vitest';
import { duracionCorta } from './tiempo.js';

describe('duracionCorta', () => {
  it.each([
    [0, '0s'],
    [42_000, '42s'],
    [59_999, '59s'],
    [60_000, '1m00s'],
    [192_000, '3m12s'],
    [3_600_000, '1h00m'],
    [3_840_000, '1h04m'],
  ])('%i ms se muestra como %s', (ms, esperado) => {
    expect(duracionCorta(ms)).toBe(esperado);
  });

  it('un valor negativo no rompe la vista', () => {
    // Puede pasar si el reloj del navegador va atrasado respecto del servidor
    expect(duracionCorta(-5000)).toBe('0s');
  });
});
