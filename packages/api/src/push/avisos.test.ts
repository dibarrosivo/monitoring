import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_POR_DEFECTO } from '@monitoring/shared';
import { quiereRecibirAhora } from './avisos.js';

describe('quiereRecibirAhora', () => {
  it('la franja de silencio se evalúa en hora de la central, no en UTC', () => {
    const noche = { ...PREFERENCIAS_POR_DEFECTO, silencioDesde: '22:00', silencioHasta: '07:00' };
    // 03:00 UTC = 23:00 en Caracas: en silencio
    expect(quiereRecibirAhora(noche, 'armadoDesarmado', new Date('2026-09-23T03:00:00Z'))).toBe(false);
    // 15:00 UTC = 11:00 en Caracas: pasa
    expect(quiereRecibirAhora(noche, 'armadoDesarmado', new Date('2026-09-23T15:00:00Z'))).toBe(true);
  });
});
