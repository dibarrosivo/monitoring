import { describe, expect, it } from 'vitest';
import {
  esAperturaFueraDeHorario,
  evaluarPendientesDia,
  horarioDelDia,
  type DefinicionHorario,
  ahoraEnZona,
  enZona,
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

describe('ahoraEnZona', () => {
  // 15:00 UTC = 11:00 en Caracas (-4) y 07:00 en Los Ángeles (-7, horario de verano)
  const referencia = new Date(Date.UTC(2026, 8, 5, 15, 0, 0));

  it('traduce la hora a la del sitio', () => {
    expect(ahoraEnZona('America/Caracas', referencia).getHours()).toBe(11);
    expect(ahoraEnZona('America/Los_Angeles', referencia).getHours()).toBe(8);
    expect(ahoraEnZona('Europe/Madrid', referencia).getHours()).toBe(17);
  });

  it('sin zona devuelve la hora del servidor', () => {
    expect(ahoraEnZona(null, referencia)).toBe(referencia);
    expect(ahoraEnZona(undefined, referencia)).toBe(referencia);
  });

  it('con un huso inválido no falla: sigue con la del servidor', () => {
    expect(ahoraEnZona('Marte/Olympus', referencia)).toBe(referencia);
  });

  it('respeta el día de la semana del lugar, no el del servidor', () => {
    // 03:00 UTC del sábado ya es viernes por la noche en Caracas
    const madrugadaSabado = new Date(Date.UTC(2026, 8, 5, 3, 0, 0));
    expect(madrugadaSabado.getUTCDay()).toBe(6);
    expect(ahoraEnZona('America/Caracas', madrugadaSabado).getDay()).toBe(5);
  });
});

// Bar nocturno: abre 18:00 y cierra 04:00 del día siguiente, tolerancia 15
const nocturno: DefinicionHorario = { dias: 'LMXJVS-', apertura: '18:00', cierre: '04:00', toleranciaMin: 15 };
const martes = (hora: string) => new Date(`2026-08-25T${hora}:00`);

describe('jornadas nocturnas', () => {
  it('marca apertura tarde pasada la hora de apertura sin apertura de esa tarde', () => {
    expect(evaluarPendientesDia([nocturno], [], [], lunes('18:20')).aperturaTarde).toBe(true);
    expect(evaluarPendientesDia([nocturno], [lunes('17:50')], [], lunes('18:20')).aperturaTarde).toBe(false);
  });

  it('una apertura de la madrugada anterior no cuenta para la jornada de hoy', () => {
    // Reingreso a las 02:00 (jornada de anoche) no exime la apertura de las 18:00
    expect(evaluarPendientesDia([nocturno], [lunes('02:00')], [lunes('03:50')], lunes('18:20')).aperturaTarde).toBe(true);
  });

  it('no marca sin cierre a medianoche: la jornada sigue', () => {
    expect(evaluarPendientesDia([nocturno], [lunes('18:05')], [], martes('00:30')).sinCierre).toBe(false);
    expect(evaluarPendientesDia([nocturno], [lunes('18:05')], [], martes('04:10')).sinCierre).toBe(false);
  });

  it('marca sin cierre pasada la hora de cierre de la madrugada si nadie cerró', () => {
    expect(evaluarPendientesDia([nocturno], [lunes('18:05')], [], martes('04:20')).sinCierre).toBe(true);
    expect(evaluarPendientesDia([nocturno], [lunes('18:05')], [martes('03:55')], martes('04:20')).sinCierre).toBe(false);
  });

  it('el cierre de anoche se evalúa aunque hoy sea día libre', () => {
    // Sábado abre; domingo es libre pero a las 04:20 del domingo se revisa el cierre del sábado
    const sab = (h: string) => new Date(`2026-08-29T${h}:00`);
    const dom = (h: string) => new Date(`2026-08-30T${h}:00`);
    const r = evaluarPendientesDia([nocturno], [sab('18:10')], [], dom('04:30'));
    expect(r).toEqual({ aperturaTarde: false, sinCierre: true });
  });

  it('la apertura de hoy no tapa el cierre pendiente de anoche', () => {
    // Abrió ayer 18:05, nunca cerró, hoy volvió a abrir 18:10: a las 18:30 el cierre de anoche sigue faltando
    const r = evaluarPendientesDia([nocturno], [lunes('18:05'), martes('18:10')], [], martes('18:30'));
    expect(r).toEqual({ aperturaTarde: false, sinCierre: true });
  });
});

describe('enZona', () => {
  it('sin huso del sitio usa el de la central (Venezuela), no el del servidor', () => {
    // 15:20 UTC son las 11:20 en Caracas
    const local = enZona(null, new Date('2026-09-21T15:20:00Z'));
    expect(local.getHours()).toBe(11);
    expect(local.getMinutes()).toBe(20);
  });
});
