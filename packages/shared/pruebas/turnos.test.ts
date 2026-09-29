import { describe, expect, it } from 'vitest';
import { deGuardia, pautaVigente, type GuardiaFecha, type TramoTurno } from '@monitoring/shared';

// 2026-09-28 es lunes
const lunes = (hora: number, min = 0) => new Date(2026, 8, 28, hora, min);
const martes = (hora: number, min = 0) => new Date(2026, 8, 29, hora, min);
const sabado = (hora: number) => new Date(2026, 9, 3, hora);

const dia: TramoTurno = { usuarioId: 1, dias: 'LMXJV--', desde: '07:00', hasta: '19:00' };
const noche: TramoTurno = { usuarioId: 2, dias: 'LMXJV--', desde: '19:00', hasta: '07:00' };
const finde: TramoTurno = { usuarioId: 3, dias: '-----SD', desde: '00:00', hasta: '23:59' };

describe('quién está de guardia', () => {
  it('el tramo de día cubre su franja y nada más', () => {
    expect(deGuardia([dia, noche, finde], [], lunes(9))).toEqual([1]);
    expect(deGuardia([dia, noche, finde], [], lunes(18, 59))).toEqual([1]);
    // El lunes a las 6:30 no cubre nadie: el tramo nocturno de lunes a viernes
    // arranca el lunes a las 19:00, así que la madrugada del lunes viene del
    // domingo, que está libre
    expect(deGuardia([dia, noche], [], lunes(6, 30))).toEqual([]);
  });

  it('el tramo nocturno cruza la medianoche: la madrugada del martes la cubre quien entró el lunes', () => {
    expect(deGuardia([dia, noche], [], lunes(22))).toEqual([2]);
    expect(deGuardia([dia, noche], [], martes(3))).toEqual([2]);
    expect(deGuardia([dia, noche], [], martes(7, 1))).toEqual([1]);
  });

  it('el fin de semana lo cubre quien corresponde', () => {
    expect(deGuardia([dia, noche, finde], [], sabado(12))).toEqual([3]);
  });

  it('sin nadie asignado devuelve vacío, para que quien llama avise a todos', () => {
    const soloLunes: TramoTurno = { usuarioId: 1, dias: 'L------', desde: '07:00', hasta: '19:00' };
    expect(deGuardia([soloLunes], [], sabado(12))).toEqual([]);
    expect(deGuardia([], [], lunes(9))).toEqual([]);
  });

  it('una guardia por fecha reemplaza a la pauta ese día', () => {
    const cambio: GuardiaFecha[] = [{ usuarioId: 9, fecha: '2026-09-28', desde: '07:00', hasta: '19:00' }];
    expect(deGuardia([dia, noche], cambio, lunes(9))).toEqual([9]);
    // y no afecta a los demás días
    expect(deGuardia([dia, noche], cambio, martes(9))).toEqual([1]);
  });

  it('una guardia nocturna por fecha también cruza la medianoche', () => {
    const g: GuardiaFecha[] = [{ usuarioId: 9, fecha: '2026-09-28', desde: '19:00', hasta: '07:00' }];
    expect(deGuardia([dia, noche], g, lunes(23))).toEqual([9]);
    expect(deGuardia([dia, noche], g, martes(2))).toEqual([9]);
  });

  it('dos personas a la vez en la misma franja es válido', () => {
    const otro: TramoTurno = { usuarioId: 5, dias: 'LMXJV--', desde: '08:00', hasta: '12:00' };
    expect(deGuardia([dia, otro], [], lunes(9)).sort()).toEqual([1, 5]);
  });
});

describe('pauta vigente', () => {
  it('con una sola pauta, esa se usa aunque no esté marcada', () => {
    expect(pautaVigente([{ id: 1, activa: false }])).toMatchObject({ id: 1 });
  });
  it('con varias, manda la marcada activa', () => {
    expect(pautaVigente([{ id: 1, activa: false }, { id: 2, activa: true }])).toMatchObject({ id: 2 });
  });
  it('con varias y ninguna activa, no hay pauta', () => {
    expect(pautaVigente([{ id: 1, activa: false }, { id: 2, activa: false }])).toBeNull();
  });
});
