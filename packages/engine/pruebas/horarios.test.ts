import { describe, expect, it } from 'vitest';
import {
  esAperturaFueraDeHorario,
  evaluarPendientesDia,
  horarioDelDia,
  type DefinicionHorario,
} from '../src/horarios.js';

// Lunes 24/08/2026 (getDay=1). Horario comercial L-V 09:00-18:00, tolerancia 30.
const comercial: DefinicionHorario = { dias: 'LMXJV--', apertura: '09:00', cierre: '18:00', toleranciaMin: 30 };
const lunes = (hora: string) => new Date(`2026-08-24T${hora}:00`);
const sabado = (hora: string) => new Date(`2026-08-29T${hora}:00`);

describe('horarioDelDia', () => {
  it('encuentra el horario en día laborable y no en día libre', () => {
    expect(horarioDelDia([comercial], lunes('10:00'))).toBe(comercial);
    expect(horarioDelDia([comercial], sabado('10:00'))).toBeNull();
  });
});

describe('esAperturaFueraDeHorario', () => {
  it('sin horarios cargados no supervisa', () => {
    expect(esAperturaFueraDeHorario([], lunes('03:00'))).toBe(false);
  });

  it('apertura dentro del horario (con tolerancia) es normal', () => {
    expect(esAperturaFueraDeHorario([comercial], lunes('08:45'))).toBe(false);
    expect(esAperturaFueraDeHorario([comercial], lunes('12:00'))).toBe(false);
    expect(esAperturaFueraDeHorario([comercial], lunes('18:20'))).toBe(false);
  });

  it('apertura de madrugada o en día libre es fuera de horario', () => {
    expect(esAperturaFueraDeHorario([comercial], lunes('03:00'))).toBe(true);
    expect(esAperturaFueraDeHorario([comercial], lunes('19:00'))).toBe(true);
    expect(esAperturaFueraDeHorario([comercial], sabado('10:00'))).toBe(true);
  });

  it('soporta horario que cruza medianoche', () => {
    const nocturno: DefinicionHorario = { dias: 'LMXJVSD', apertura: '20:00', cierre: '02:00', toleranciaMin: 15 };
    expect(esAperturaFueraDeHorario([nocturno], lunes('21:00'))).toBe(false);
    expect(esAperturaFueraDeHorario([nocturno], lunes('01:30'))).toBe(false);
    expect(esAperturaFueraDeHorario([nocturno], lunes('12:00'))).toBe(true);
  });
});

describe('evaluarPendientesDia', () => {
  it('marca apertura tarde cuando pasó la tolerancia sin apertura', () => {
    const r = evaluarPendientesDia([comercial], [], [], lunes('09:45'));
    expect(r.aperturaTarde).toBe(true);
    expect(r.sinCierre).toBe(false);
  });

  it('no marca nada si la apertura llegó a tiempo', () => {
    const r = evaluarPendientesDia([comercial], [lunes('09:05')], [], lunes('10:00'));
    expect(r).toEqual({ aperturaTarde: false, sinCierre: false });
  });

  it('marca sin cierre cuando pasó el horario y el sitio quedó abierto', () => {
    const r = evaluarPendientesDia([comercial], [lunes('09:05')], [], lunes('18:45'));
    expect(r.sinCierre).toBe(true);
    expect(r.aperturaTarde).toBe(false);
  });

  it('no marca sin cierre si hubo cierre después de la última apertura', () => {
    const r = evaluarPendientesDia([comercial], [lunes('09:05')], [lunes('18:10')], lunes('18:45'));
    expect(r.sinCierre).toBe(false);
  });

  it('reapertura sin nuevo cierre vuelve a marcar sin cierre', () => {
    const r = evaluarPendientesDia([comercial], [lunes('09:05'), lunes('18:20')], [lunes('18:10')], lunes('18:50'));
    expect(r.sinCierre).toBe(true);
  });

  it('día libre no genera pendientes', () => {
    const r = evaluarPendientesDia([comercial], [], [], sabado('12:00'));
    expect(r).toEqual({ aperturaTarde: false, sinCierre: false });
  });
});
