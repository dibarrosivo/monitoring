import { describe, expect, it } from 'vitest';
import { interpretarPima, usuarioDeApertura, usuarioDeArmadoEnCasa, usuarioDeCierre } from '../src/pima.js';
import { abreAlarma } from '../src/protocolos.js';

/**
 * Los casos salen de dos fuentes: el catálogo de eventos del sistema en uso
 * (365 Connect Pro, protocolo 4, leído el 15 de septiembre de 2026) y el
 * tráfico real de la central, capturado el 10 y el 15 de septiembre.
 */

describe('códigos verificados contra el tráfico real', () => {
  it('TH es la prueba periódica y no abre alarma', () => {
    // Trama real: "1061      7002    TH", mostrada por el sistema en uso como "Test 0B"
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
    expect(e.zona).toBe('000');
  });

  it('RW y RX son batería baja y su restauración', () => {
    expect(interpretarPima({ numeroCuenta: '7063', codigo: 'RW' }).categoria).toBe('averia');
    expect(interpretarPima({ numeroCuenta: '7063', codigo: 'RX' }).categoria).toBe('restauracion');
  });

  it('RU y RV son falla de red eléctrica y su restauración', () => {
    // RV llegó cinco veces la noche del 14 de septiembre y quedaba "sin traducir"
    const falla = interpretarPima({ numeroCuenta: '7002', codigo: 'RU' });
    const vuelve = interpretarPima({ numeroCuenta: '7002', codigo: 'RV' });
    expect(falla.codigo).toBe('E301');
    expect(vuelve.codigo).toBe('R301');
    expect(vuelve.categoria).toBe('restauracion');
  });
});

describe('SW no es un atraco', () => {
  /*
   * El sistema en uso lo etiqueta "HOLD-UP 00" pero nunca lo procesó como
   * alarma (0 de 66 en la última semana), y en el tráfico real llega un
   * minuto antes de cada cierre: SW y luego PA, SW y luego PD. Se registra
   * para que quede rastro, pero no saca al operador de lo que está haciendo.
   */
  it('se registra como aviso de sistema con prioridad mínima', () => {
    const e = interpretarPima({ numeroCuenta: '7054', codigo: 'SW' });
    expect(e.categoria).toBe('sistema');
    expect(e.prioridad).toBe(5);
    expect(e.codigo).toBe('PIMA-SW');
  });

  it('el catálogo de protocolos impide que abra alarma', () => {
    expect(abreAlarma({ codigo: 'PIMA-SW', codigoCid: '000' })).toBe(false);
  });

  it('el atraco real es RP, apertura bajo coacción, con prioridad máxima', () => {
    const e = interpretarPima({ numeroCuenta: '7054', codigo: 'RP' });
    expect(e.categoria).toBe('alarma');
    expect(e.codigo).toBe('E121');
    expect(e.prioridad).toBe(1);
    expect(e.descripcion).toMatch(/coacción/i);
  });
});

describe('series por zona', () => {
  // Cada serie ocupa 96 códigos seguidos; el desplazamiento es la zona menos uno.
  it.each([
    ['AA', 'E140', 'alarma', '001', 'Alarma en zona 1'],
    ['AE', 'E140', 'alarma', '005', 'Alarma en zona 5'],
    ['DR', 'E140', 'alarma', '096', 'Alarma en zona 96'],
    ['DS', 'R140', 'restauracion', '001', 'Restauración: Alarma en zona 1'],
    ['EA', 'R140', 'restauracion', '009', 'Restauración: Alarma en zona 9'],
    ['HJ', 'R140', 'restauracion', '096', 'Restauración: Alarma en zona 96'],
    ['HK', 'E380', 'averia', '001', 'Falla en zona 1'],
    ['LB', 'E380', 'averia', '096', 'Falla en zona 96'],
    ['LC', 'E570', 'anulacion', '001', 'Exclusión en zona 1'],
    ['NU', 'E570', 'anulacion', '071', 'Exclusión en zona 71'],
    ['OS', 'E570', 'anulacion', '095', 'Exclusión en zona 95'],
  ])('%s es %s de la zona %s', (codigo, esperado, categoria, zona, descripcion) => {
    const e = interpretarPima({ numeroCuenta: '7080', codigo });
    expect(e.codigo).toBe(esperado);
    expect(e.categoria).toBe(categoria);
    expect(e.zona).toBe(zona);
    expect(e.descripcion).toBe(descripcion);
  });

  it('una alarma de zona abre alarma; su restauración y una exclusión, no', () => {
    expect(interpretarPima({ numeroCuenta: '7080', codigo: 'AK' }).categoria).toBe('alarma');
    expect(interpretarPima({ numeroCuenta: '7080', codigo: 'EC' }).categoria).toBe('restauracion');
    expect(interpretarPima({ numeroCuenta: '7080', codigo: 'LD' }).categoria).toBe('anulacion');
  });

  it('los eventos de horario ocupan tres huecos de la serie de exclusiones', () => {
    // OA, OM y OT serían las exclusiones 77, 89 y 96, pero el sistema en uso
    // los tiene como apertura tarde, apertura temprana y cierre tarde
    for (const [codigo, texto] of [
      ['OA', /apertura tarde/i],
      ['OM', /apertura temprana/i],
      ['OT', /cierre tarde/i],
    ] as const) {
      const e = interpretarPima({ numeroCuenta: '7080', codigo });
      expect(e.categoria).toBe('sistema');
      expect(e.descripcion).toMatch(texto);
    }
  });
});

describe('aperturas por número de usuario', () => {
  // QS es el maestro y de ahí en adelante cuenta de a uno, arrastrando la
  // primera letra: QT=1 … QZ=7, RA=8 … RM=20. Verificado con puntos reales
  // (QT, QU, QV, QW, QY, RA) y con el catálogo del sistema en uso.
  it.each([
    ['QS', 0],
    ['QT', 1],
    ['QV', 3],
    ['QY', 6],
    ['RA', 8],
    ['RM', 20],
  ])('%s corresponde al usuario %i', (codigo, esperado) => {
    expect(usuarioDeApertura(codigo)).toBe(esperado);
  });

  it('nombra al usuario en el evento', () => {
    const e = interpretarPima({ numeroCuenta: '7015', codigo: 'QV' });
    expect(e.categoria).toBe('apertura');
    expect(e.zona).toBe('003');
  });

  it('RN, RO y TJ son aperturas sin número de usuario', () => {
    expect(interpretarPima({ numeroCuenta: '7015', codigo: 'RN' }).descripcion).toMatch(/código temporal/);
    expect(interpretarPima({ numeroCuenta: '7015', codigo: 'RO' }).codigo).toBe('E409');
    expect(interpretarPima({ numeroCuenta: '7015', codigo: 'TJ' }).categoria).toBe('apertura');
  });

  it('un código fuera del patrón no se fuerza a usuario', () => {
    expect(usuarioDeApertura('TH')).toBeNull();
    expect(usuarioDeApertura('RN')).toBeNull();
    expect(usuarioDeApertura('01')).toBeNull();
  });
});

describe('cierres por número de usuario', () => {
  // Trama real: "1061      7028    OV", traducida por el sistema en uso como "Cierre 1"
  it.each([
    ['OU', 0],
    ['OV', 1],
    ['PA', 6],
    ['PD', 9],
    ['PO', 20],
  ])('%s corresponde al usuario %i', (codigo, esperado) => {
    expect(usuarioDeCierre(codigo)).toBe(esperado);
  });

  it('PA es un cierre del usuario 6, no un evento sin traducir', () => {
    // Capturado el 15 de septiembre: "1061      7054    PA"
    const e = interpretarPima({ numeroCuenta: '7054', codigo: 'PA' });
    expect(e.categoria).toBe('cierre');
    expect(e.zona).toBe('006');
  });

  it('los usuarios 21 y 22 tienen códigos aparte', () => {
    expect(interpretarPima({ numeroCuenta: '7054', codigo: 'UA' }).zona).toBe('021');
    expect(interpretarPima({ numeroCuenta: '7054', codigo: 'UB' }).zona).toBe('022');
  });

  it('PP, PQ, PR y PS son cierres sin número de usuario', () => {
    expect(interpretarPima({ numeroCuenta: '7054', codigo: 'PP' }).categoria).toBe('cierre');
    expect(interpretarPima({ numeroCuenta: '7054', codigo: 'PR' }).codigo).toBe('R403');
    expect(interpretarPima({ numeroCuenta: '7054', codigo: 'PS' }).codigo).toBe('R409');
  });
});

describe('armado en casa por número de usuario', () => {
  it.each([
    ['PT', 0],
    ['PU', 1],
    ['QN', 20],
  ])('%s corresponde al usuario %i', (codigo, esperado) => {
    expect(usuarioDeArmadoEnCasa(codigo)).toBe(esperado);
  });

  it('se traduce como armado en modo presente', () => {
    const e = interpretarPima({ numeroCuenta: '7054', codigo: 'PU' });
    expect(e.codigo).toBe('R441');
    expect(e.categoria).toBe('cierre');
    expect(e.zona).toBe('001');
  });

  it('QO, QP, QQ y QR son armados en casa sin número de usuario', () => {
    for (const codigo of ['QO', 'QP', 'QQ', 'QR']) {
      expect(interpretarPima({ numeroCuenta: '7054', codigo }).codigo).toBe('R441');
    }
  });
});

describe('las series no se pisan entre sí', () => {
  it('el maestro de una serie no cae dentro de otra', () => {
    expect(usuarioDeCierre('QS')).toBeNull();
    expect(usuarioDeApertura('OU')).toBeNull();
    expect(usuarioDeArmadoEnCasa('QS')).toBeNull();
    expect(usuarioDeCierre('PT')).toBeNull();
  });

  it('los eventos sueltos entre las series no se leen como usuarios', () => {
    // PP..PS quedan entre los cierres y el armado en casa; QO..QR entre el
    // armado en casa y las aperturas. Ninguno debe interpretarse por aritmética.
    for (const codigo of ['PP', 'PS', 'QO', 'QR', 'RN']) {
      expect(usuarioDeCierre(codigo)).toBeNull();
      expect(usuarioDeArmadoEnCasa(codigo)).toBeNull();
      expect(usuarioDeApertura(codigo)).toBeNull();
    }
  });

  it('RW sigue siendo avería y no apertura del usuario 30', () => {
    expect(interpretarPima({ numeroCuenta: '7063', codigo: 'RW' }).categoria).toBe('averia');
  });
});

describe('sistema y alimentación', () => {
  it.each([
    ['RS', 'E137', 'alarma'],
    ['RT', 'R137', 'restauracion'],
    ['RY', 'E351', 'averia'],
    ['RZ', 'R351', 'restauracion'],
    ['SC', 'E321', 'averia'],
    ['SK', 'E120', 'alarma'],
    ['SX', 'E120', 'alarma'],
    ['SY', 'E110', 'alarma'],
    ['SM', 'E601', 'prueba'],
    ['TF', 'E140', 'alarma'],
    ['TK', 'E380', 'averia'],
  ])('%s se traduce a %s (%s)', (codigo, esperado, categoria) => {
    const e = interpretarPima({ numeroCuenta: '7002', codigo });
    expect(e.codigo).toBe(esperado);
    expect(e.categoria).toBe(categoria);
  });

  it('el reset de sirena y el reset general no abren alarma', () => {
    for (const codigo of ['RQ', 'TG']) {
      const e = interpretarPima({ numeroCuenta: '7002', codigo });
      expect(e.categoria).toBe('sistema');
      expect(abreAlarma({ codigo: e.codigo, codigoCid: e.codigoCid })).toBe(false);
    }
  });

  it('un código incorrecto en el teclado sí abre alarma', () => {
    const e = interpretarPima({ numeroCuenta: '7002', codigo: 'SL' });
    expect(e.categoria).toBe('sistema');
    expect(abreAlarma({ codigo: e.codigo, codigoCid: e.codigoCid })).toBe(true);
  });
});

describe('códigos que no conocemos', () => {
  it('el estado interno del receptor no abre alarma', () => {
    // Cuenta 8000, códigos 01 y 02: la autoprueba del receptor, cada 45
    // minutos. El sistema en uso la descarta sin mostrarla.
    for (const codigo of ['01', '02']) {
      const e = interpretarPima({ numeroCuenta: '8000', codigo });
      expect(e.categoria).toBe('prueba');
      expect(e.prioridad).toBe(5);
    }
  });

  it('un código sin definir se marca como sistema para que alguien lo mire', () => {
    // TA..TE y TL, TM, TQ, TR están vacíos en el catálogo del sistema en uso.
    // Deliberado: preferimos una alarma de más ante un código sin traducir
    // antes que dejar pasar en silencio algo que podría ser un atraco.
    for (const codigo of ['TA', 'TL', 'ZZ']) {
      const e = interpretarPima({ numeroCuenta: '7002', codigo });
      expect(e.categoria).toBe('sistema');
      expect(e.descripcion).toMatch(/sin traducir/i);
      expect(e.codigo).toBe(`PIMA-${codigo}`);
    }
  });
});
