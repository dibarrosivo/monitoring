import { describe, expect, it } from 'vitest';
import { conceptoCuota, periodoDesde, repartirPago, situacionCuota, sumarMeses } from '@monitoring/shared';

describe('períodos de cobro', () => {
  it('suma meses conservando el día, o el último del mes si no existe', () => {
    expect(sumarMeses('2026-01-15', 1)).toBe('2026-02-15');
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2026-11-30', 3)).toBe('2027-02-28');
  });
  it('el período termina el día anterior al siguiente inicio', () => {
    expect(periodoDesde('2026-10-01', 1)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', siguiente: '2026-11-01' });
    expect(periodoDesde('2026-10-15', 3)).toEqual({ desde: '2026-10-15', hasta: '2027-01-14', siguiente: '2027-01-15' });
  });
  it('nombra la cuota como la nombraría la central', () => {
    expect(conceptoCuota('2026-10-01', '2026-10-31', 1)).toBe('Mensualidad de octubre 2026');
    expect(conceptoCuota('2026-10-15', '2026-11-14', 1)).toBe('Mensualidad del 15/10/2026 al 14/11/2026');
    expect(conceptoCuota('2026-10-01', '2026-12-31', 3)).toBe('Servicio del 01/10/2026 al 31/12/2026');
  });
});

describe('reparto de pagos', () => {
  const cuotas = [
    { id: 1, montoUsd: 25, pagadoUsd: 10 },
    { id: 2, montoUsd: 25, pagadoUsd: 0 },
    { id: 3, montoUsd: 25, pagadoUsd: 0 },
  ];
  it('cubre la más vieja primero y sigue con la siguiente', () => {
    expect(repartirPago(30, cuotas)).toEqual({ aplicado: [{ cuotaId: 1, montoUsd: 15 }, { cuotaId: 2, montoUsd: 15 }], sobrante: 0 });
  });
  it('lo que sobra queda a favor', () => {
    expect(repartirPago(100, cuotas)).toEqual({ aplicado: [{ cuotaId: 1, montoUsd: 15 }, { cuotaId: 2, montoUsd: 25 }, { cuotaId: 3, montoUsd: 25 }], sobrante: 35 });
    expect(repartirPago(10, [])).toEqual({ aplicado: [], sobrante: 10 });
  });
  it('no se pierde un céntimo con decimales', () => {
    expect(repartirPago(0.1 + 0.2, [{ id: 1, montoUsd: 0.3, pagadoUsd: 0 }])).toEqual({ aplicado: [{ cuotaId: 1, montoUsd: 0.3 }], sobrante: 0 });
  });
});

describe('situación de una cuota', () => {
  it('pendiente pasada de fecha es vencida', () => {
    expect(situacionCuota({ estado: 'pendiente', venceEn: '2026-09-01' }, '2026-09-24')).toBe('vencida');
    expect(situacionCuota({ estado: 'pendiente', venceEn: '2026-09-24' }, '2026-09-24')).toBe('pendiente');
    expect(situacionCuota({ estado: 'pagada', venceEn: '2026-09-01' }, '2026-09-24')).toBe('pagada');
  });
});
