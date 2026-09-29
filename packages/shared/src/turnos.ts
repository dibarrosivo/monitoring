/**
 * Quién está de guardia en la central en un momento dado.
 *
 * Dos formas, y la segunda manda: una **pauta semanal** (el cuadrante de
 * siempre, con varias pautas posibles para rotaciones) y **guardias por
 * fecha** (la excepción: vacaciones, un cambio entre operadores, un feriado).
 * Si un día tiene guardias cargadas, esas reemplazan a la pauta ese día.
 *
 * Lógica pura y sin base de datos, para poder probarla.
 */

export interface TramoTurno {
  usuarioId: number;
  /** 'LMXJVSD' con '-' en los días libres, posición 0 = lunes */
  dias: string;
  /** 'HH:MM' o 'HH:MM:SS' */
  desde: string;
  hasta: string;
}

export interface GuardiaFecha {
  usuarioId: number;
  /** 'AAAA-MM-DD' */
  fecha: string;
  desde: string;
  hasta: string;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** getDay() de JS: 0=domingo … 6=sábado → posición en 'LMXJVSD' (0=lunes). */
function posicionDia(fecha: Date): number {
  return (fecha.getDay() + 6) % 7;
}

function fechaIso(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

/**
 * ¿El momento cae dentro del tramo? Admite tramos que cruzan la medianoche
 * (19:00 a 07:00): en ese caso el tramo que cubre la madrugada es el que
 * empezó el día anterior, así que se mira también el día previo.
 */
function cubre(tramo: { dias: string; desde: string; hasta: string }, fecha: Date): boolean {
  const m = fecha.getHours() * 60 + fecha.getMinutes();
  const desde = minutos(tramo.desde);
  const hasta = minutos(tramo.hasta);
  const hoy = tramo.dias[posicionDia(fecha)] !== undefined && tramo.dias[posicionDia(fecha)] !== '-';

  if (desde < hasta) return hoy && m >= desde && m < hasta;

  // Cruza la medianoche: o es hoy después de la hora de inicio, o es la
  // madrugada de un tramo que arrancó ayer
  const ayer = new Date(fecha);
  ayer.setDate(ayer.getDate() - 1);
  const arrancoAyer = tramo.dias[posicionDia(ayer)] !== undefined && tramo.dias[posicionDia(ayer)] !== '-';
  return (hoy && m >= desde) || (arrancoAyer && m < hasta);
}

/** Igual que el anterior, para una guardia con fecha fija. */
function cubreGuardia(g: GuardiaFecha, fecha: Date): boolean {
  const m = fecha.getHours() * 60 + fecha.getMinutes();
  const desde = minutos(g.desde);
  const hasta = minutos(g.hasta);
  const hoy = fechaIso(fecha);
  const ayer = new Date(fecha);
  ayer.setDate(ayer.getDate() - 1);

  if (desde < hasta) return g.fecha === hoy && m >= desde && m < hasta;
  return (g.fecha === hoy && m >= desde) || (g.fecha === fechaIso(ayer) && m < hasta);
}

/**
 * Los usuarios de guardia en ese momento, sin repetir. Vacío significa que
 * no hay nadie asignado, y quien llama decide qué hacer (avisarle a todos).
 *
 * El orden es: manda la guardia por fecha que cubra este momento; si no hay
 * ninguna pero **el día de hoy está gobernado por guardias**, entonces ese
 * hueco está vacío a propósito; y si hoy no tiene guardias cargadas, rige la
 * pauta semanal.
 *
 * `ahora` tiene que venir ya en la hora de la central.
 */
export function deGuardia(tramos: TramoTurno[], guardias: GuardiaFecha[], ahora: Date = new Date()): number[] {
  const cubiertos = guardias.filter((g) => cubreGuardia(g, ahora)).map((g) => g.usuarioId);
  if (cubiertos.length > 0) return [...new Set(cubiertos)];

  const hoyTieneGuardias = guardias.some((g) => g.fecha === fechaIso(ahora));
  if (hoyTieneGuardias) return [];

  return [...new Set(tramos.filter((t) => cubre(t, ahora)).map((t) => t.usuarioId))];
}

/** La pauta que rige: la marcada activa o, si hay una sola, esa. */
export function pautaVigente<T extends { id: number; activa: boolean }>(pautas: T[]): T | null {
  return pautas.find((p) => p.activa) ?? (pautas.length === 1 ? pautas[0]! : null);
}
