import { describe, expect, it } from 'vitest';
import { decidirAtras } from './atras.js';

describe('botón atrás', () => {
  it('cierra primero lo que está encima, y solo desde el inicio pregunta si salir', () => {
    expect(decidirAtras({ modalAbierto: true, panelAbierto: true, enInicio: false })).toBe('cerrar-modal');
    expect(decidirAtras({ modalAbierto: false, panelAbierto: true, enInicio: false })).toBe('cerrar-panel');
    expect(decidirAtras({ modalAbierto: false, panelAbierto: false, enInicio: false })).toBe('inicio');
    expect(decidirAtras({ modalAbierto: false, panelAbierto: false, enInicio: true })).toBe('confirmar-salida');
  });
});
