import { describe, expect, it } from 'vitest';
import { parsearLineaPima } from '@monitoring/protocols';

/**
 * El escucha en sí necesita base de datos, así que se ejercita en las pruebas
 * de integración. Aquí se cubre el troceo del flujo, que es donde un error
 * pasaría inadvertido: una trama mal cortada se pierde o se duplica sin que
 * nada falle a la vista.
 */

const SEPARADORES = /[\r\n\x14]+/;

function trocear(fragmentos: string[]): string[] {
  const salida: string[] = [];
  let resto = '';
  for (const f of fragmentos) {
    resto += f;
    const partes = resto.split(SEPARADORES);
    resto = partes.pop() ?? '';
    for (const p of partes) if (p.trim()) salida.push(p);
  }
  return salida;
}

describe('troceo del flujo del receptor PIMA', () => {
  it('corta por DC4 aunque lleguen varias tramas juntas', () => {
    const lineas = trocear(['1061      7002    TH\x141061      7079    QS\x14']);
    expect(lineas).toHaveLength(2);
    expect(parsearLineaPima(lineas[0]!)?.numeroCuenta).toBe('7002');
    expect(parsearLineaPima(lineas[1]!)?.codigo).toBe('QS');
  });

  it('arma una trama partida entre dos paquetes', () => {
    // TCP no respeta los límites del mensaje: una trama puede llegar en pedazos
    const lineas = trocear(['1061      70', '02    TH\x14']);
    expect(lineas).toHaveLength(1);
    expect(parsearLineaPima(lineas[0]!)?.numeroCuenta).toBe('7002');
  });

  it('no emite una trama incompleta hasta que llega su terminador', () => {
    expect(trocear(['1061      7002    TH'])).toHaveLength(0);
  });

  it('admite CR y LF como terminadores alternativos', () => {
    expect(trocear(['1061      7002    TH\r\n'])).toHaveLength(1);
  });

  it('varios separadores seguidos no generan tramas vacías', () => {
    expect(trocear(['1061      7002    TH\x14\r\n\x14'])).toHaveLength(1);
  });
});
