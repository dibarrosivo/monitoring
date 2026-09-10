import { describe, expect, it } from 'vitest';
import { abreAlarma, protocoloPara } from '../src/protocolos.js';

describe('protocolo por tipo de evento', () => {
  it('el robo manda verificar antes de despachar', () => {
    const pasos = protocoloPara({ codigo: 'E130', codigoCid: '130', categoria: 'alarma' });
    expect(pasos[0]).toMatch(/palabra clave/i);
    expect(pasos.join(' ')).toMatch(/despachar móvil/i);
  });

  it('el incendio avisa a bomberos antes de llamar al sitio', () => {
    const pasos = protocoloPara({ codigo: 'E110', codigoCid: '110', categoria: 'alarma' });
    expect(pasos[0]).toMatch(/bomberos/i);
  });

  it('la coacción prohíbe expresamente llamar al sitio', () => {
    // Es la diferencia que puede costar una vida: si hay alguien coaccionado,
    // llamar avisa al agresor de que la central se dio cuenta.
    for (const codigo of ['120', '121', '122']) {
      const pasos = protocoloPara({ codigo: `E${codigo}`, codigoCid: codigo, categoria: 'alarma' });
      expect(pasos.join(' ')).toMatch(/no llamar|no alertar/i);
    }
  });

  it('un código sin entrada propia cae en los pasos de su categoría', () => {
    const pasos = protocoloPara({ codigo: 'E147', codigoCid: '147', categoria: 'averia' });
    expect(pasos.length).toBeGreaterThan(0);
    expect(pasos.join(' ')).toMatch(/persiste/i);
  });

  it('los eventos que genera la central tienen su propio protocolo', () => {
    expect(protocoloPara({ codigo: 'HOR-AF', categoria: 'sistema' }).join(' ')).toMatch(/fuera de horario/i);
    expect(protocoloPara({ codigo: 'BRIDGE', categoria: 'sistema' }).join(' ')).toMatch(/ciegos/i);
  });
});

describe('qué abre alarma', () => {
  it('la prueba periódica no molesta al operador', () => {
    expect(abreAlarma({ codigo: 'E602', codigoCid: '602' })).toBe(false);
  });

  it('la apertura por usuario tampoco', () => {
    expect(abreAlarma({ codigo: 'E401', codigoCid: '401' })).toBe(false);
  });

  it('ante la duda, abre', () => {
    // Un código que no conocemos vale una alarma de más antes que una de menos
    expect(abreAlarma({ codigo: 'E999', codigoCid: '999' })).toBe(true);
    expect(abreAlarma({ codigo: 'E130', codigoCid: '130' })).toBe(true);
  });

  it('los eventos críticos de la central siempre abren', () => {
    expect(abreAlarma({ codigo: 'BRIDGE' })).toBe(true);
    expect(abreAlarma({ codigo: 'HOR-AF' })).toBe(true);
  });
});
