import { describe, expect, it } from 'vitest';
import { parsearLineaSurgard } from '@monitoring/protocols';
import { trocearSurgard } from '../src/surgardTcp.js';

/**
 * El escucha en sí necesita base de datos y se ejercita en integración. Aquí
 * se cubre el troceo, que es donde un error pasa inadvertido: una trama mal
 * cortada se pierde o se duplica sin que nada falle a la vista.
 */

function trocear(fragmentos: string[]): string[] {
  const salida: string[] = [];
  let resto = '';
  for (const f of fragmentos) {
    const r = trocearSurgard(resto, f);
    resto = r.resto;
    salida.push(...r.tramas);
  }
  return salida;
}

describe('troceo del flujo Sur-Gard por TCP', () => {
  it('corta por DC4 aunque lleguen varias tramas juntas', () => {
    const tramas = trocear(['5011 187037E13001004\x145011 187037R13001004\x14']);
    expect(tramas).toHaveLength(2);
    expect(parsearLineaSurgard(tramas[1]!)).toMatchObject({ calificador: 3, zona: '004' });
  });

  it('arma una trama partida entre dos paquetes', () => {
    const tramas = trocear(['5011 18703', '7E13001004\x14']);
    expect(tramas).toHaveLength(1);
    expect(parsearLineaSurgard(tramas[0]!)).toMatchObject({ numeroCuenta: '7037', codigoCid: '130' });
  });

  it('separa las retransmisiones que llegaron pegadas en una sola línea', () => {
    // Tal como lo recibió la central: varias copias sin terminador entre medio
    const tramas = trocear(['5011 187037E130010035011 187037E130010035011 187037E13001003\x14']);
    expect(tramas).toHaveLength(3);
    expect(tramas.every((t) => parsearLineaSurgard(t).tipo === 'cid')).toBe(true);
  });

  it('el latido del receptor es una trama más, que se confirma', () => {
    const tramas = trocear(['1011           @    \x14']);
    expect(tramas).toHaveLength(1);
    expect(parsearLineaSurgard(tramas[0]!)).toEqual({ tipo: 'latido' });
  });

  it('no emite una trama incompleta hasta que llega su terminador', () => {
    expect(trocear(['5011 187037E13001004'])).toHaveLength(0);
  });

  it('un flujo sin terminadores no crece sin límite', () => {
    const r = trocearSurgard('', 'x'.repeat(5000));
    expect(r.resto).toBe('');
  });
});
