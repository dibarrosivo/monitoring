import { describe, expect, it } from 'vitest';
import { conVoz, enSilencio, PREFERENCIAS_POR_DEFECTO, quiereRecibir } from '@monitoring/shared';

const a = (hora: number) => new Date(2026, 0, 1, hora, 0);

describe('preferencias de avisos', () => {
  it('alarmas y emergencias (sin grupo) pasan aunque todo esté apagado', () => {
    const todoApagado = { ...PREFERENCIAS_POR_DEFECTO, armadoDesarmado: false, averias: false, sistema: false, silencioDesde: '00:00', silencioHasta: '23:59' };
    expect(quiereRecibir(todoApagado, null, a(3))).toBe(true);
    expect(quiereRecibir(todoApagado, 'armadoDesarmado', a(3))).toBe(false);
  });
  it('respeta el grupo apagado', () => {
    const sinArmados = { ...PREFERENCIAS_POR_DEFECTO, armadoDesarmado: false };
    expect(quiereRecibir(sinArmados, 'armadoDesarmado')).toBe(false);
    expect(quiereRecibir(sinArmados, 'averias')).toBe(true);
    expect(quiereRecibir({ ...PREFERENCIAS_POR_DEFECTO, averias: false }, 'averias')).toBe(false);
  });
  it('la franja de silencio cruza la medianoche', () => {
    const noche = { ...PREFERENCIAS_POR_DEFECTO, silencioDesde: '22:00', silencioHasta: '07:00' };
    expect(enSilencio(noche, a(23))).toBe(true);
    expect(enSilencio(noche, a(3))).toBe(true);
    expect(enSilencio(noche, a(7))).toBe(false);
    expect(enSilencio(noche, a(12))).toBe(false);
    expect(quiereRecibir(noche, 'armadoDesarmado', a(23))).toBe(false);
    expect(quiereRecibir(noche, 'armadoDesarmado', a(9))).toBe(true);
  });
  it('voz: siempre, solo alarmas o nunca', () => {
    expect(conVoz({ ...PREFERENCIAS_POR_DEFECTO, vozPush: 'siempre' }, 'avisos')).toBe(true);
    expect(conVoz({ ...PREFERENCIAS_POR_DEFECTO, vozPush: 'solo_alarmas' }, 'avisos')).toBe(false);
    expect(conVoz({ ...PREFERENCIAS_POR_DEFECTO, vozPush: 'solo_alarmas' }, 'alarmas')).toBe(true);
    expect(conVoz({ ...PREFERENCIAS_POR_DEFECTO, vozPush: 'nunca' }, 'alarmas')).toBe(false);
    expect(conVoz({ ...PREFERENCIAS_POR_DEFECTO, vozPush: undefined }, 'avisos')).toBe(true);
  });
});
