import { describe, expect, it } from 'vitest';
import { interpretarCid } from '@monitoring/shared';
import { esCancelacionDelUsuario, estaEnPrueba, ventanaDeVerificacion } from '../src/verificacion.js';

const cid = (codigoCid: string, calificador: 1 | 3 = 1) =>
  interpretarCid({ numeroCuenta: '7054', calificador, codigoCid, particion: '01', zona: '003' });
const t0 = new Date('2026-09-20T10:00:00Z');

describe('cuenta en prueba', () => {
  it('vence sola', () => {
    expect(estaEnPrueba({ enPruebaHasta: null }, t0)).toBe(false);
    expect(estaEnPrueba({ enPruebaHasta: new Date(t0.getTime() + 60_000) }, t0)).toBe(true);
    expect(estaEnPrueba({ enPruebaHasta: new Date(t0.getTime() - 1) }, t0)).toBe(false);
  });
});

describe('ventana de cancelación por el usuario', () => {
  it('solo retiene robos, y por el tiempo configurado en el panel', () => {
    expect(ventanaDeVerificacion(cid('130'), { ventanaCancelacionSeg: 45 }, t0)?.getTime()).toBe(t0.getTime() + 45_000);
    expect(ventanaDeVerificacion(cid('140'), { ventanaCancelacionSeg: 30 }, t0)?.getTime()).toBe(t0.getTime() + 30_000);
    expect(ventanaDeVerificacion(cid('130'), { ventanaCancelacionSeg: 0 }, t0)).toBeNull();
  });
  it('nunca retiene emergencias, averías ni eventos de sistema', () => {
    expect(ventanaDeVerificacion(cid('120'), { ventanaCancelacionSeg: 45 }, t0)).toBeNull(); // pánico
    expect(ventanaDeVerificacion(cid('110'), { ventanaCancelacionSeg: 45 }, t0)).toBeNull(); // incendio
    expect(ventanaDeVerificacion(cid('139'), { ventanaCancelacionSeg: 45 }, t0)).toBeNull(); // robo verificado
    expect(ventanaDeVerificacion(cid('301'), { ventanaCancelacionSeg: 45 }, t0)).toBeNull(); // falla AC
    expect(ventanaDeVerificacion({ codigo: 'SIS', categoria: 'sistema', prioridad: 2 }, { ventanaCancelacionSeg: 45 }, t0)).toBeNull();
  });
  it('reconoce la cancelación: desarmado o cancelación por usuario', () => {
    expect(esCancelacionDelUsuario(cid('401', 1))).toBe(true); // apertura (desarmado)
    expect(esCancelacionDelUsuario(cid('401', 3))).toBe(false); // cierre (armado)
    expect(esCancelacionDelUsuario(cid('406'))).toBe(true); // cancelación
    expect(esCancelacionDelUsuario(cid('130', 3))).toBe(false); // restauración del sensor no cancela
  });
});
