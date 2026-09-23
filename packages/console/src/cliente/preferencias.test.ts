import { describe, expect, it } from 'vitest';
import { enSilencio, PREFERENCIAS_POR_DEFECTO, quiereRecibir } from './preferencias.js';

const a = (h: number, m = 0) => new Date(2026, 8, 23, h, m);

describe('preferencias de avisos', () => {
  it('emergencias y alarmas pasan siempre, aunque todo esté apagado y en silencio', () => {
    const todoApagado = { armadoDesarmado: false, averias: false, sistema: false, silencioDesde: '00:00', silencioHasta: '23:59' };
    expect(quiereRecibir(todoApagado, { categoria: 'alarma', tono: 'alarma' }, a(3))).toBe(true);
    expect(quiereRecibir(todoApagado, { categoria: 'alarma', tono: 'emergencia' }, a(3))).toBe(true);
    expect(quiereRecibir(todoApagado, { categoria: 'apertura', tono: 'estado' }, a(3))).toBe(false);
  });
  it('respeta cada grupo', () => {
    const sinArmados = { ...PREFERENCIAS_POR_DEFECTO, armadoDesarmado: false };
    expect(quiereRecibir(sinArmados, { categoria: 'cierre', tono: 'estado' })).toBe(false);
    expect(quiereRecibir(sinArmados, { categoria: 'averia', tono: 'aviso' })).toBe(true);
    expect(quiereRecibir({ ...PREFERENCIAS_POR_DEFECTO, averias: false }, { categoria: 'restauracion', tono: 'bien' })).toBe(false);
  });
  it('la franja de silencio cruza la medianoche', () => {
    const noche = { ...PREFERENCIAS_POR_DEFECTO, silencioDesde: '22:00', silencioHasta: '07:00' };
    expect(enSilencio(noche, a(23))).toBe(true);
    expect(enSilencio(noche, a(3))).toBe(true);
    expect(enSilencio(noche, a(7))).toBe(false);
    expect(enSilencio(noche, a(12))).toBe(false);
    expect(quiereRecibir(noche, { categoria: 'apertura', tono: 'estado' }, a(23))).toBe(false);
    expect(quiereRecibir(noche, { categoria: 'apertura', tono: 'estado' }, a(9))).toBe(true);
  });
});
