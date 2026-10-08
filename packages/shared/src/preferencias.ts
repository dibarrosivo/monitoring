import type { CanalPush } from './central.js';

/**
 * Qué quiere recibir el usuario de la app. Emergencias y alarmas no se
 * apagan: solo se puede elegir sobre lo demás. El servidor aplica estas
 * reglas al mandar el push (app cerrada) y la app las aplica con el
 * WebSocket (app abierta): es el mismo criterio en los dos lados.
 */

export type VozPush = 'siempre' | 'solo_alarmas' | 'nunca';

export interface PreferenciasAviso {
  armadoDesarmado: boolean;
  averias: boolean;
  sistema: boolean;
  /** 'HH:MM' ambas, o null ambas */
  silencioDesde: string | null;
  silencioHasta: string | null;
  /** Voz en los avisos con la app cerrada; la notificación llega igual */
  vozPush?: VozPush;
}

/** Grupo de preferencia al que pertenece un aviso; null = alarma o emergencia, que siempre pasa. */
export type GrupoAviso = Exclude<keyof PreferenciasAviso, 'silencioDesde' | 'silencioHasta' | 'vozPush'>;

export const PREFERENCIAS_POR_DEFECTO: PreferenciasAviso = {
  armadoDesarmado: true,
  averias: true,
  sistema: true,
  silencioDesde: null,
  silencioHasta: null,
  vozPush: 'siempre',
};

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * ¿Estamos dentro de la franja de silencio? Admite franjas que cruzan la
 * medianoche (22:00 a 07:00). `ahoraLocal` ya tiene que estar en la hora de
 * la central (en la app es la hora del teléfono; en el servidor, enZona()).
 */
export function enSilencio(prefs: Pick<PreferenciasAviso, 'silencioDesde' | 'silencioHasta'>, ahoraLocal: Date = new Date()): boolean {
  if (!prefs.silencioDesde || !prefs.silencioHasta) return false;
  const m = ahoraLocal.getHours() * 60 + ahoraLocal.getMinutes();
  const desde = minutos(prefs.silencioDesde);
  const hasta = minutos(prefs.silencioHasta);
  return desde <= hasta ? m >= desde && m < hasta : m >= desde || m < hasta;
}

/** ¿Este aviso se le muestra o se le dice al usuario? Sin grupo (alarmas), siempre; el resto según preferencias y silencio. */
export function quiereRecibir(prefs: PreferenciasAviso, grupo: GrupoAviso | null, ahoraLocal: Date = new Date()): boolean {
  if (grupo === null) return true;
  if (!prefs[grupo]) return false;
  return !enSilencio(prefs, ahoraLocal);
}

/** ¿Este aviso se dice en voz alta en el teléfono? La notificación llega igual. */
export function conVoz(prefs: Pick<PreferenciasAviso, 'vozPush'>, canal: CanalPush): boolean {
  const v = prefs.vozPush ?? 'siempre';
  return v === 'siempre' || (v === 'solo_alarmas' && canal === 'alarmas');
}

/**
 * Qué quiere recibir en el teléfono el PERSONAL de la central. Es su teléfono
 * personal, así que cada uno decide todo: qué le llega y cuándo suena, aun
 * estando de guardia. Decisión del dueño (2026-10-08): control total y sin
 * respaldo; si el de guardia silenció las emergencias, la alarma queda en la
 * cola de la consola hasta que alguien la vea.
 */
export interface PreferenciasPersonal {
  /** Pánico, incendio, coacción, médica de un cliente */
  emergencias: boolean;
  /** Central muda, puente caído: nos quedamos ciegos */
  fallasCentral: boolean;
  /** Puente restablecido, panel silencioso */
  informativos: boolean;
  /** 'HH:MM' ambas, o null ambas. Calla TODO lo de la central en esa franja. */
  silencioDesde: string | null;
  silencioHasta: string | null;
  vozPush: VozPush;
}

export const PREFERENCIAS_PERSONAL_POR_DEFECTO: PreferenciasPersonal = {
  emergencias: true,
  fallasCentral: true,
  informativos: true,
  silencioDesde: null,
  silencioHasta: null,
  vozPush: 'siempre',
};

export type GrupoPersonal = 'emergencias' | 'fallasCentral' | 'informativos';

/** A qué grupo pertenece un aviso al personal, por su código. */
export function grupoDeAvisoPersonal(codigo: string | undefined): GrupoPersonal {
  if (codigo === 'SIS-GEN' || codigo === 'BRIDGE') return 'fallasCentral';
  if (codigo === 'BRIDGE-R' || codigo === 'SIS') return 'informativos';
  return 'emergencias';
}

/** ¿Este aviso le llega a esta persona del personal? Sin excepciones: lo decide ella. */
export function personalQuiereRecibir(prefs: PreferenciasPersonal, grupo: GrupoPersonal, ahoraLocal: Date = new Date()): boolean {
  if (!prefs[grupo]) return false;
  return !enSilencio(prefs, ahoraLocal);
}
