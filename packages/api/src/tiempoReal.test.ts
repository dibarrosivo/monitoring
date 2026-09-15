import { describe, expect, it } from 'vitest';
import { debeRecibir, type Suscriptor } from './tiempoReal.js';

const personal: Suscriptor = { usuarioId: 1, rol: 'operador', paneles: null, alcanceCalculadoEn: 0 };
const clienteA: Suscriptor = { usuarioId: 7, rol: 'cliente', paneles: new Set([10, 11]), alcanceCalculadoEn: 0 };

describe('quién recibe cada mensaje en tiempo real', () => {
  it('el personal de la central recibe todo, incluso eventos sin panel', () => {
    expect(debeRecibir(personal, { panelId: 10 })).toBe(true);
    expect(debeRecibir(personal, { panelId: null })).toBe(true);
    expect(debeRecibir(personal, null)).toBe(true);
  });

  it('un cliente solo recibe los eventos de sus paneles', () => {
    expect(debeRecibir(clienteA, { panelId: 10 })).toBe(true);
    expect(debeRecibir(clienteA, { panelId: 11 })).toBe(true);
    expect(debeRecibir(clienteA, { panelId: 12 })).toBe(false);
  });

  it('una cuenta desconocida no llega a ningún cliente', () => {
    // Alguien transmite y nadie lo mira: es asunto de la central, no de un cliente
    expect(debeRecibir(clienteA, { panelId: null })).toBe(false);
    expect(debeRecibir(clienteA, {})).toBe(false);
    expect(debeRecibir(clienteA, null)).toBe(false);
  });

  it('un cliente sin accesos no recibe nada', () => {
    const sinAccesos: Suscriptor = { ...clienteA, paneles: new Set() };
    expect(debeRecibir(sinAccesos, { panelId: 10 })).toBe(false);
  });
});
