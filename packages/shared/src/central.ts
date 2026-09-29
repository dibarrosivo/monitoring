/**
 * Parámetros de la central que tienen que coincidir en el servidor y en la
 * consola/app. El servidor puede ajustarlos por variable de entorno; la app
 * usa el valor por defecto. Si un valor cambia, se cambia acá y en ningún
 * otro lado.
 */

/** Huso horario de la central (IANA). El servidor lo puede cambiar con ZONA_HORARIA_CENTRAL. */
export const ZONA_HORARIA_POR_DEFECTO = 'America/Caracas';

/** Minutos sin ninguna señal para dar la central por muda. El servidor lo puede cambiar con SILENCIO_GENERAL_MIN. */
export const SILENCIO_GENERAL_MIN_POR_DEFECTO = 20;

/**
 * Canales de notificación de Android. Android no deja cambiar un canal ya
 * creado: si cambia el sonido, cambia el id, y el servidor lo acompaña.
 * AvisosService.java tiene la misma tabla (Java no puede importar esto).
 */
export const CANAL_PUSH = {
  alarmas: 'alarmas-v2',
  avisos: 'avisos-v2',
} as const;

export type CanalPush = keyof typeof CANAL_PUSH;

/** Sonido de las alarmas en el teléfono (res/raw en Android). */
export const SONIDO_ALARMA = 'sirena.wav';
