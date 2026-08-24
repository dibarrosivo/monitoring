import { describe, expect, it } from 'vitest';
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
