import { describe, expect, it } from 'vitest';
import { domingoDePascua, feriadosVenezuela } from './feriados.js';

describe('feriados de Venezuela', () => {
  it('calcula la Pascua', () => {
    expect(domingoDePascua(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(domingoDePascua(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    expect(domingoDePascua(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
  });
  it('ubica Carnaval y Semana Santa de 2026', () => {
    const f = Object.fromEntries(feriadosVenezuela(2026).map((x) => [x.descripcion, x.fecha]));
    expect(f['Lunes de Carnaval']).toBe('2026-02-16');
    expect(f['Martes de Carnaval']).toBe('2026-02-17');
    expect(f['Jueves Santo']).toBe('2026-04-02');
    expect(f['Viernes Santo']).toBe('2026-04-03');
    expect(feriadosVenezuela(2026)).toHaveLength(14);
  });
});
