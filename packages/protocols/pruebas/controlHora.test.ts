import { describe, expect, it } from 'vitest';
import { evaluarHora } from '../src/controlHora.js';

const ahora = new Date('2026-10-05T12:00:00Z');
const hace = (s: number) => new Date(ahora.getTime() - s * 1000);

describe('evaluarHora (control de repetición DC-09)', () => {
  it('acepta la demora normal de una trama (los Hikvision llegan con 2 a 3,5 s)', () => {
    expect(evaluarHora(hace(3), ahora)).toEqual({ ok: true, atrasoSeg: 3 });
  });

  it('acepta hasta 40 s de atraso y 20 s de adelanto, como pide el estándar', () => {
    expect(evaluarHora(hace(40), ahora).ok).toBe(true);
    expect(evaluarHora(hace(-20), ahora).ok).toBe(true);
  });

  it('rechaza una trama vieja: es lo que tendría una trama capturada y reenviada', () => {
    expect(evaluarHora(hace(41), ahora)).toEqual({ ok: false, motivo: 'fuera-de-ventana', atrasoSeg: 41 });
    expect(evaluarHora(hace(3600), ahora).ok).toBe(false);
  });

  it('rechaza una trama del futuro', () => {
    expect(evaluarHora(hace(-21), ahora)).toEqual({ ok: false, motivo: 'fuera-de-ventana', atrasoSeg: -21 });
  });

  it('una placa que manda la hora de Venezuela en vez de GMT queda 4 h corrida', () => {
    // Es lo que hacen hoy la ESP32 (AL-7010) y el equipo de Gerald's (AL-7006)
    expect(evaluarHora(hace(-4 * 3600), ahora).ok).toBe(false);
  });

  it('sin hora no hay con qué comparar', () => {
    expect(evaluarHora(undefined, ahora)).toEqual({ ok: false, motivo: 'sin-hora' });
    expect(evaluarHora(new Date('fecha rota'), ahora)).toEqual({ ok: false, motivo: 'sin-hora' });
  });
});
