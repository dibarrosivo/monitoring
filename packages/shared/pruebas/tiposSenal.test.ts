import { describe, expect, it } from 'vitest';
import { interpretarCid } from '../src/contactId.js';
import { interpretarPima } from '../src/pima.js';
import { tipoSenal } from '../src/tiposSenal.js';

const cid = (codigoCid: string, calificador: 1 | 3 = 1) =>
  interpretarCid({ numeroCuenta: '1234', calificador, codigoCid, particion: '01', zona: '001' });

describe('tipoSenal', () => {
  it('separa emergencias de robos por la prioridad del código', () => {
    expect(tipoSenal(cid('120'))).toBe('emergencia'); // pánico
    expect(tipoSenal(cid('110'))).toBe('emergencia'); // incendio
    expect(tipoSenal(cid('100'))).toBe('emergencia'); // médica
    expect(tipoSenal(cid('130'))).toBe('robo');
    expect(tipoSenal(cid('140'))).toBe('robo');
    expect(tipoSenal(cid('137'))).toBe('robo'); // tamper
  });

  it('clasifica fallas, restauraciones, aperturas y pruebas', () => {
    expect(tipoSenal(cid('301'))).toBe('averia');
    expect(tipoSenal(cid('130', 3))).toBe('restauracion');
    expect(tipoSenal(cid('301', 3))).toBe('restauracion');
    expect(tipoSenal(cid('401'))).toBe('apertura_cierre');
    expect(tipoSenal(cid('401', 3))).toBe('apertura_cierre');
    expect(tipoSenal(cid('406'))).toBe('apertura_cierre'); // cancelación por usuario
    expect(tipoSenal(cid('570'))).toBe('anulacion');
    expect(tipoSenal(cid('602'))).toBe('prueba');
  });

  it('reconoce el control de horario de PIMA, del motor y de Contact ID', () => {
    expect(tipoSenal(interpretarPima({ numeroCuenta: '7048', codigo: 'TO' }))).toBe('horario'); // no ha cerrado
    expect(tipoSenal(interpretarPima({ numeroCuenta: '7048', codigo: 'SW' }))).toBe('horario'); // aviso previo al cierre
    expect(tipoSenal({ codigo: 'HOR-AF', categoria: 'sistema', prioridad: 2 })).toBe('horario');
    expect(tipoSenal(cid('452'))).toBe('horario');
  });

  it('deja en sistema lo que genera la central y lo desconocido', () => {
    expect(tipoSenal({ codigo: 'SIS', categoria: 'sistema', prioridad: 2 })).toBe('sistema');
    expect(tipoSenal(interpretarPima({ numeroCuenta: '7048', codigo: 'RQ' }))).toBe('sistema'); // reset de sirena
    expect(tipoSenal({ codigo: 'X', categoria: 'desconocido', prioridad: 3 })).toBe('sistema');
    expect(tipoSenal(interpretarPima({ numeroCuenta: '7048', codigo: 'AA' }))).toBe('robo'); // alarma zona 1
  });
});
