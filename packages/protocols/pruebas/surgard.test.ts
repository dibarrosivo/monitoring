import { describe, expect, it } from 'vitest';
import { separarTramasPegadas } from '../src/surgard.js';
import { parsearLineaSurgard } from '@monitoring/protocols';

describe('parsearLineaSurgard', () => {
  it('reconoce el latido del receptor', () => {
    expect(parsearLineaSurgard('1011           @    \x14')).toEqual({ tipo: 'latido' });
  });

  it('parsea una línea CID con el patrón principal', () => {
    const r = parsearLineaSurgard('5011123418113001015\x14');
    expect(r.tipo).toBe('cid');
    if (r.tipo !== 'cid') return;
    expect(r.receptor).toBe('01');
    expect(r.linea).toBe('1');
    expect(r.numeroCuenta).toBe('1234');
    expect(r.calificador).toBe(1);
    expect(r.codigoCid).toBe('130');
    expect(r.particion).toBe('01');
    expect(r.zona).toBe('015');
    expect(r.parseLaxo).toBe(false);
  });

  it('recurre al patrón de reserva ante variantes con espacios', () => {
    const r = parsearLineaSurgard('  1234 18 3301 01 000\r\n');
    expect(r.tipo).toBe('cid');
    if (r.tipo !== 'cid') return;
    expect(r.numeroCuenta).toBe('1234');
    expect(r.calificador).toBe(3);
    expect(r.codigoCid).toBe('301');
    expect(r.parseLaxo).toBe(true);
  });

  it('marca como desconocido lo que no reconoce', () => {
    const r = parsearLineaSurgard('XYZ 42');
    expect(r.tipo).toBe('desconocido');
  });
});

describe('MLR2 con calificador de letra (receptores por IP)', () => {
  // Capturadas en la central el 15 de septiembre de 2026
  it('lee lo que entrega el receptor EBS OSM', () => {
    const r = parsearLineaSurgard('5011 187037E13001004\x14');
    expect(r).toMatchObject({ tipo: 'cid', numeroCuenta: '7037', calificador: 1, codigoCid: '130', particion: '01', zona: '004', parseLaxo: false });
  });

  it('lee lo que entrega el Hik IP Receiver, con cabecera más larga', () => {
    const r = parsearLineaSurgard('501001 187037R30100000');
    expect(r).toMatchObject({ tipo: 'cid', numeroCuenta: '7037', calificador: 3, codigoCid: '301', particion: '00', zona: '000' });
  });

  it('P es un evento previo aún activo', () => {
    expect(parsearLineaSurgard('5011 187037P13001004')).toMatchObject({ calificador: 6 });
  });

  it('el latido por defecto de OSM se reconoce como latido', () => {
    expect(parsearLineaSurgard('1011           @    ')).toEqual({ tipo: 'latido' });
  });
});

describe('tramas pegadas sin terminador', () => {
  it('separa las copias retransmitidas que llegaron juntas', () => {
    // Visto en la central: seis copias de la misma trama en una sola línea
    const pegadas = '5011 187037E130010035011 187037E130010035011 187037E13001003';
    const partes = separarTramasPegadas(pegadas);
    expect(partes).toHaveLength(3);
    expect(partes.every((p) => parsearLineaSurgard(p).tipo === 'cid')).toBe(true);
  });

  it('una trama sola queda como está', () => {
    expect(separarTramasPegadas('5011 187037E13001004')).toEqual(['5011 187037E13001004']);
  });

  it('no inventa cortes en texto que no es una sucesión exacta de tramas', () => {
    const raro = '5011 187037E13001004 basura 5011 187037E13001005';
    expect(separarTramasPegadas(raro)).toEqual([raro]);
  });
});
