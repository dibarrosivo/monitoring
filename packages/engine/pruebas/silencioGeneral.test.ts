import { describe, expect, it } from 'vitest';
import { haySilencioGeneral } from '../src/vigilante.js';

const t = (min: number) => new Date(Date.UTC(2026, 8, 22, 3, min));

describe('silencio general de la central', () => {
  it('avisa cuando la última señal pasó el límite, o nunca hubo una', () => {
    expect(haySilencioGeneral(t(0), t(21), 20)).toBe(true);
    expect(haySilencioGeneral(null, t(21), 20)).toBe(true);
  });
  it('no avisa mientras entren señales dentro del límite', () => {
    expect(haySilencioGeneral(t(5), t(21), 20)).toBe(false);
    expect(haySilencioGeneral(t(1), t(21), 20)).toBe(false);
  });
});
