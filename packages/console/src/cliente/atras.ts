/**
 * Qué hace el botón ATRÁS de Android en la app, en orden de prioridad:
 * cierra lo que esté encima (un modal), cierra la pantalla del panel, vuelve
 * al inicio, y solo desde el inicio pregunta si salir. Es pura para probarla;
 * el cableado con el plugin está en useBotonAtras.
 */
export type AccionAtras = 'cerrar-modal' | 'cerrar-panel' | 'inicio' | 'confirmar-salida';

export function decidirAtras(estado: { modalAbierto: boolean; panelAbierto: boolean; enInicio: boolean }): AccionAtras {
  if (estado.modalAbierto) return 'cerrar-modal';
  if (estado.panelAbierto) return 'cerrar-panel';
  if (!estado.enInicio) return 'inicio';
  return 'confirmar-salida';
}
