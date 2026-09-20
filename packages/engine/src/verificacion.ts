import { tipoSenal, type EventoNormalizado } from '@monitoring/shared';

/**
 * Reglas puras de dos mecanismos que evitan falsas alarmas, separadas del
 * acceso a datos para poder probarlas.
 */

/** ¿La cuenta está en prueba en este instante? */
export function estaEnPrueba(panel: { enPruebaHasta: Date | null }, ahora: Date): boolean {
  return panel.enPruebaHasta !== null && panel.enPruebaHasta.getTime() > ahora.getTime();
}

/**
 * Hasta cuándo esperar el desarmado del usuario antes de presentar la alarma,
 * o null si esta señal se presenta de inmediato. Solo aplica a robo e
 * intrusión: una emergencia (pánico, fuego, médica), una avería o un panel
 * silencioso no se cancelan con un código de usuario.
 */
export function ventanaDeVerificacion(
  normalizado: Pick<EventoNormalizado, 'codigo' | 'categoria' | 'prioridad'>,
  panel: { ventanaCancelacionSeg: number },
  recibidaEn: Date,
): Date | null {
  if (panel.ventanaCancelacionSeg <= 0) return null;
  if (tipoSenal(normalizado) !== 'robo') return null;
  return new Date(recibidaEn.getTime() + panel.ventanaCancelacionSeg * 1000);
}

/** ¿Este evento es el usuario cancelando (desarmó o canceló desde el teclado)? */
export function esCancelacionDelUsuario(normalizado: Pick<EventoNormalizado, 'categoria' | 'calificador'>): boolean {
  return (normalizado.categoria === 'apertura' && normalizado.calificador === 1) || normalizado.categoria === 'cancelacion';
}
