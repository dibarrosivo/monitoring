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

/**
 * Latidos perdidos para dar por caído un puente. Con latido cada 60 s, 5
 * significan 5 minutos sin latido, y el aviso sale entre 5 y 6 minutos
 * después del último (el vigilante revisa cada minuto). Se subió de 3 a 5 el
 * 2026-10-06: el internet de la central (Mangonet) se corta seguido un par de
 * minutos y vuelve solo, y con 3 eso daba avisos que no hacían falta. La
 * misma regla la usan el aviso y la luz roja de la consola.
 */
export const LATIDOS_PERDIDOS_PUENTE = 5;
