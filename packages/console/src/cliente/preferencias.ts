import type { CategoriaEvento, PreferenciasAviso } from '../tipos.js';
import type { Tono } from './frases.js';

export const PREFERENCIAS_POR_DEFECTO: PreferenciasAviso = { armadoDesarmado: true, averias: true, sistema: true, silencioDesde: null, silencioHasta: null };

/** Grupo de preferencia al que pertenece un evento, o null si es alarma/emergencia (siempre pasa). */
export function grupoDeAviso(categoria: CategoriaEvento | undefined, tono: Tono): 'armadoDesarmado' | 'averias' | 'sistema' | null {
  if (tono === 'emergencia' || tono === 'alarma') return null;
  switch (categoria) {
    case 'apertura':
    case 'cierre':
    case 'cancelacion':
      return 'armadoDesarmado';
    case 'averia':
    case 'restauracion':
    case 'anulacion':
      return 'averias';
    default:
      return 'sistema';
  }
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** ¿Estamos dentro de la franja de silencio? Admite franjas que cruzan la medianoche (22:00 a 07:00). */
export function enSilencio(prefs: PreferenciasAviso, ahora: Date = new Date()): boolean {
  if (!prefs.silencioDesde || !prefs.silencioHasta) return false;
  const m = ahora.getHours() * 60 + ahora.getMinutes();
  const desde = minutos(prefs.silencioDesde);
  const hasta = minutos(prefs.silencioHasta);
  return desde <= hasta ? m >= desde && m < hasta : m >= desde || m < hasta;
}

/**
 * ¿Este aviso se le muestra o se le dice al usuario? Emergencias y alarmas,
 * siempre. El resto según sus preferencias y su franja de silencio.
 */
export function quiereRecibir(prefs: PreferenciasAviso, evento: { categoria?: CategoriaEvento; tono: Tono }, ahora: Date = new Date()): boolean {
  const grupo = grupoDeAviso(evento.categoria, evento.tono);
  if (grupo === null) return true;
  if (!prefs[grupo]) return false;
  return !enSilencio(prefs, ahora);
}
