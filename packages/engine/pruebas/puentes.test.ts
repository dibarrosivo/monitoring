import { describe, expect, it } from 'vitest';
import { duracionLegible } from '../src/vigilante.js';

/** El aviso de puente restablecido dice cuánto duró el corte. */
describe('duracionLegible', () => {
  it('minutos, horas y días, sin adornos', () => {
    expect(duracionLegible(1)).toBe('1 min');
    expect(duracionLegible(45)).toBe('45 min');
    expect(duracionLegible(60)).toBe('1 h');
    expect(duracionLegible(135)).toBe('2 h 15 min');
    expect(duracionLegible(1440)).toBe('1 d 0 h');
    expect(duracionLegible(3000)).toBe('2 d 2 h');
  });
});
