import { describe, expect, it } from 'vitest';
import { interpretarCid } from '@monitoring/shared';

const base = { numeroCuenta: '1234', particion: '01', zona: '015' } as const;

describe('interpretarCid', () => {
  it('clasifica un robo nuevo como alarma prioridad 2', () => {
    const e = interpretarCid({ ...base, calificador: 1, codigoCid: '130' });
    expect(e.categoria).toBe('alarma');
    expect(e.codigo).toBe('E130');
    expect(e.prioridad).toBe(2);
    expect(e.descripcion).toBe('Robo');
  });

  it('clasifica incendio y pánico como prioridad 1', () => {
    expect(interpretarCid({ ...base, calificador: 1, codigoCid: '110' }).prioridad).toBe(1);
    expect(interpretarCid({ ...base, calificador: 1, codigoCid: '120' }).prioridad).toBe(1);
  });

  it('clasifica la restauración de una alarma', () => {
    const e = interpretarCid({ ...base, calificador: 3, codigoCid: '130' });
    expect(e.categoria).toBe('restauracion');
    expect(e.codigo).toBe('R130');
    expect(e.descripcion).toContain('Restauración');
  });

  it('distingue apertura (E401) de cierre (R401)', () => {
    expect(interpretarCid({ ...base, calificador: 1, codigoCid: '401' }).categoria).toBe('apertura');
    expect(interpretarCid({ ...base, calificador: 3, codigoCid: '401' }).categoria).toBe('cierre');
  });

  it('clasifica la prueba periódica', () => {
    const e = interpretarCid({ ...base, calificador: 1, codigoCid: '602' });
    expect(e.categoria).toBe('prueba');
    expect(e.prioridad).toBe(5);
  });

  it('clasifica averías y cancelaciones', () => {
    expect(interpretarCid({ ...base, calificador: 1, codigoCid: '301' }).categoria).toBe('averia');
    expect(interpretarCid({ ...base, calificador: 1, codigoCid: '406' }).categoria).toBe('cancelacion');
  });

  it('clasifica códigos desconocidos por rango', () => {
    const e = interpretarCid({ ...base, calificador: 1, codigoCid: '199' });
    expect(e.categoria).toBe('alarma');
    expect(e.descripcion).toContain('199');
  });
});

describe('textos de fallas y restauraciones', () => {
  it('la electricidad se llama electricidad, no "red", y la restauración se dice en lenguaje natural', () => {
    const falla = interpretarCid({ numeroCuenta: '7037', calificador: 1, codigoCid: '301', particion: '01', zona: '000' });
    const vuelve = interpretarCid({ numeroCuenta: '7037', calificador: 3, codigoCid: '301', particion: '01', zona: '000' });
    expect(falla.descripcion).toBe('Falla de electricidad (sin corriente)');
    expect(vuelve.descripcion).toBe('Restauración de electricidad');
    // Sin frase propia, queda el prefijo genérico
    const robo = interpretarCid({ numeroCuenta: '7037', calificador: 3, codigoCid: '130', particion: '01', zona: '003' });
    expect(robo.descripcion).toBe('Restauración: Robo');
  });
});
