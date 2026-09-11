/**
 * Control remoto de paneles: armar, armar en casa, desarmar.
 *
 * Solo algunos equipos lo admiten, y por vías completamente distintas del
 * reporte. Conviene tener presente por qué:
 *
 *  - El reporte llega por SIA DC-09, que es un protocolo de UN SOLO SENTIDO.
 *    Lleva eventos del panel a la central y no tiene forma de llevar órdenes
 *    de vuelta. Por ahí no se controla nada, por diseño del protocolo.
 *  - Hikvision sí se controla, pero contra la nube del fabricante, que es un
 *    canal aparte. El panel ya está conectado ahí, así que no importa que esté
 *    detrás del NAT de una operadora.
 *  - Los demás equipos no tienen canal de vuelta y no se controlan.
 *
 * Esa separación es deseable, no un rodeo: si la nube del fabricante se cae,
 * seguimos recibiendo alarmas igual. El monitoreo, que es lo que no puede
 * fallar, no depende del canal de control.
 */

export type AccionComando = 'armar' | 'armar_casa' | 'desarmar';

export interface ResultadoComando {
  /** ¿El fabricante aceptó la orden? No dice que el panel haya cambiado de estado. */
  aceptado: boolean;
  /** Mensaje del fabricante cuando falla, para poder diagnosticar */
  detalle?: string;
}

export interface ProveedorControl {
  /** Nombre para los registros */
  readonly nombre: string;
  enviar(entrada: {
    /** Identificador del equipo ante el fabricante (serial, no nuestro id) */
    serial: string;
    accion: AccionComando;
    particion: string;
  }): Promise<ResultadoComando>;
}

/**
 * Proveedor para los equipos que no admiten control. Existe para que el resto
 * del sistema no tenga que preguntar "¿y si no hay proveedor?" en cada punto:
 * siempre hay uno, y este responde que no se puede.
 */
export const SIN_CONTROL: ProveedorControl = {
  nombre: 'sin-control',
  async enviar() {
    return { aceptado: false, detalle: 'Este equipo no admite control remoto' };
  },
};

/** Tipos de equipo que admiten control, con el proveedor que les corresponde. */
const PROVEEDORES = new Map<string, () => ProveedorControl>();

export function registrarProveedor(tipoPanel: string, crear: () => ProveedorControl): void {
  PROVEEDORES.set(tipoPanel, crear);
}

/** Devuelve SIN_CONTROL cuando el tipo de equipo no admite comandos. */
export function proveedorPara(tipoPanel: string): ProveedorControl {
  return PROVEEDORES.get(tipoPanel)?.() ?? SIN_CONTROL;
}

export function admiteControl(tipoPanel: string): boolean {
  return PROVEEDORES.has(tipoPanel);
}
