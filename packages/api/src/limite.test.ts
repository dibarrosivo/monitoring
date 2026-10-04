import { describe, expect, it } from 'vitest';
import { crearLimitador } from './limite.js';

describe('crearLimitador', () => {
  it('deja pasar hasta el tope y frena el siguiente', () => {
    const l = crearLimitador({ max: 3, ventanaMs: 1000 });
    expect([l.permitir('a', 0), l.permitir('a', 1), l.permitir('a', 2), l.permitir('a', 3)]).toEqual([true, true, true, false]);
  });

  it('cada clave lleva su propia cuenta', () => {
    const l = crearLimitador({ max: 1, ventanaMs: 1000 });
    expect(l.permitir('a', 0)).toBe(true);
    expect(l.permitir('b', 0)).toBe(true);
    expect(l.permitir('a', 1)).toBe(false);
  });

  it('pasada la ventana vuelve a dejar pasar', () => {
    const l = crearLimitador({ max: 1, ventanaMs: 1000 });
    l.permitir('a', 0);
    expect(l.permitir('a', 999)).toBe(false);
    expect(l.permitir('a', 1000)).toBe(true);
  });

  it('anotar y bloqueado sirven para contar solo los fallos', () => {
    const l = crearLimitador({ max: 2, ventanaMs: 1000 });
    expect(l.bloqueado('a', 0)).toBe(false);
    l.anotar('a', 0);
    l.anotar('a', 1);
    expect(l.bloqueado('a', 2)).toBe(true);
    // preguntar no cuenta
    expect(l.bloqueado('a', 3)).toBe(true);
  });

  it('reiniciar borra lo acumulado (un login correcto)', () => {
    const l = crearLimitador({ max: 1, ventanaMs: 1000 });
    l.anotar('a', 0);
    expect(l.bloqueado('a', 1)).toBe(true);
    l.reiniciar('a');
    expect(l.bloqueado('a', 2)).toBe(false);
  });
});
