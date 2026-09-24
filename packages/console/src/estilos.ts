/**
 * Clases repetidas de formularios y botones. Un solo lugar: si cambia el
 * borde o el tamaño de un campo, cambia en todas las pantallas. Tailwind
 * necesita las clases escritas completas en el código fuente.
 */

/** Consola de operador: bordes rectos, compacto. */
export const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
export const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';
export const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
export const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';

/** App del cliente: más aire y bordes redondeados, para el dedo. */
export const CAMPO_APP = 'bg-fondo border border-borde rounded-lg px-3 py-2 text-sm w-full';
export const BOTON_APP = 'bg-acento/15 hover:bg-acento/25 border border-acento text-acento rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50';
