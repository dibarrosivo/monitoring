import { describe, expect, it } from 'vitest';
import { grupoDeAvisoPersonal, personalQuiereRecibir, PREFERENCIAS_PERSONAL_POR_DEFECTO as BASE } from '../src/preferencias.js';

const a = (h: number, m = 0) => new Date(2026, 9, 8, h, m);

describe('avisos al personal: control total de cada uno', () => {
  it('cada aviso cae en su grupo', () => {
    expect(grupoDeAvisoPersonal('E120')).toBe('emergencias');
    expect(grupoDeAvisoPersonal('SIS-GEN')).toBe('fallasCentral');
    expect(grupoDeAvisoPersonal('BRIDGE')).toBe('fallasCentral');
    expect(grupoDeAvisoPersonal('BRIDGE-R')).toBe('informativos');
    expect(grupoDeAvisoPersonal('SIS')).toBe('informativos');
  });

  it('por defecto le llega todo', () => {
    for (const g of ['emergencias', 'fallasCentral', 'informativos'] as const) expect(personalQuiereRecibir(BASE, g, a(12))).toBe(true);
  });

  it('puede apagar las emergencias, aun de guardia: lo decide el dueño del teléfono', () => {
    expect(personalQuiereRecibir({ ...BASE, emergencias: false }, 'emergencias', a(12))).toBe(false);
  });

  it('el horario de silencio calla todo, emergencias incluidas, y cruza la medianoche', () => {
    const p = { ...BASE, silencioDesde: '22:00', silencioHasta: '07:00' };
    expect(personalQuiereRecibir(p, 'emergencias', a(23))).toBe(false);
    expect(personalQuiereRecibir(p, 'fallasCentral', a(3))).toBe(false);
    expect(personalQuiereRecibir(p, 'emergencias', a(7))).toBe(true);
    expect(personalQuiereRecibir(p, 'emergencias', a(21, 59))).toBe(true);
  });
});
