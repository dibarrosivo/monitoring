import { describe, expect, it } from 'vitest';
import { interpretarPima, usuarioDeApertura } from '../src/pima.js';

/**
 * Casos tomados del tráfico real de la central el 10 de septiembre de 2026.
 * Cada traducción esperada se verificó contra el evento que el sistema en uso
 * mostró para la misma cuenta y el mismo segundo.
 */

describe('códigos verificados contra el tráfico real', () => {
  it('TH es la prueba periódica y no abre alarma', () => {
    // Trama real: "1061      7002    TH" a las 10:54:25, mostrada como "TH - Test 0B"
    const e = interpretarPima({ numeroCuenta: '7002', codigo: 'TH' });
    expect(e.categoria).toBe('prueba');
    expect(e.codigo).toBe('E602');
    expect(e.prioridad).toBe(5);
  });

  it('QS es apertura con código maestro', () => {
    const e = interpretarPima({ numeroCuenta: '7079', codigo: 'QS' });
    expect(e.categoria).toBe('apertura');
    expect(e.zona).toBe('000');
  });

  it('OU es cierre con código maestro', () => {
    const e = interpretarPima({ numeroCuenta: '7079', codigo: 'OU' });
    expect(e.categoria).toBe('cierre');
  });

  it('SW es atraco y entra con prioridad máxima', () => {
    const e = interpretarPima({ numeroCuenta: '7050', codigo: 'SW' });
    expect(e.categoria).toBe('alarma');
    expect(e.prioridad).toBe(1);
    expect(e.descripcion).toMatch(/pánico/i);
  });

  it('RW y RX son batería baja y su restauración', () => {
    expect(interpretarPima({ numeroCuenta: '7063', codigo: 'RW' }).categoria).toBe('averia');
    expect(interpretarPima({ numeroCuenta: '7063', codigo: 'RX' }).categoria).toBe('restauracion');
  });
});

describe('aperturas por número de usuario', () => {
  // El segundo carácter avanza en el alfabeto y arrastra al primero.
  // Puntos verificados en el tráfico real: QS=maestro, QT=1, QU=2, QV=3, QW=4, QY=6, RA=8.
  it.each([
    ['QS', 0],
    ['QT', 1],
    ['QU', 2],
    ['QV', 3],
    ['QW', 4],
    ['QY', 6],
    ['RA', 8],
  ])('%s corresponde al usuario %i', (codigo, esperado) => {
    expect(usuarioDeApertura(codigo)).toBe(esperado);
  });

  it('nombra al usuario en el evento', () => {
    const e = interpretarPima({ numeroCuenta: '7015', codigo: 'QV' });
    expect(e.categoria).toBe('apertura');
    expect(e.zona).toBe('003');
  });

  it('un código fuera del patrón no se fuerza a usuario', () => {
    expect(usuarioDeApertura('TH')).toBeNull();
    expect(usuarioDeApertura('01')).toBeNull();
  });
});

describe('códigos que no conocemos', () => {
  it('el estado interno del receptor no abre alarma', () => {
    // Cuenta 8000, códigos 01 y 02: la cuenta propia del receptor, en pares,
    // varias veces por día. El sistema en uso ni los muestra al operador.
    for (const codigo of ['01', '02']) {
      const e = interpretarPima({ numeroCuenta: '8000', codigo });
      expect(e.categoria).toBe('prueba');
      expect(e.prioridad).toBe(5);
    }
  });

  it('un código nuevo se marca como sistema para que alguien lo mire', () => {
    // Deliberado: preferimos una alarma de más ante un código desconocido
    // antes que dejar pasar en silencio algo que podría ser un atraco.
    const e = interpretarPima({ numeroCuenta: '7002', codigo: 'ZZ' });
    expect(e.categoria).toBe('sistema');
    expect(e.descripcion).toMatch(/sin traducir/i);
    expect(e.codigo).toBe('PIMA-ZZ');
  });
});
