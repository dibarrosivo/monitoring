/**
 * Lógica pura de supervisión de horarios (sin base de datos, para poder probarla).
 *
 * Todas las fechas que entran acá están en la hora del sitio (ver enZona):
 * el servidor corre en UTC y los comercios en Venezuela, y "abre a las 11:20"
 * se refiere a la hora del lugar. Cubre jornadas del mismo día y jornadas
 * nocturnas (apertura 18:00, cierre 04:00 del día siguiente).
 */

import { ZONA_HORARIA_POR_DEFECTO } from '@monitoring/shared';

/** Huso de la central: se usa para todo sitio que no tenga el suyo cargado. */
export const ZONA_HORARIA_CENTRAL = process.env.ZONA_HORARIA_CENTRAL ?? ZONA_HORARIA_POR_DEFECTO;

export interface DefinicionHorario {
  /** 'LMXJVSD' con '-' en los días libres, posición 0 = lunes */
  dias: string;
  /** 'HH:MM' o 'HH:MM:SS' */
  apertura: string;
  cierre: string;
  toleranciaMin: number;
}

/** getDay() de JS: 0=domingo … 6=sábado → posición en 'LMXJVSD' (0=lunes). */
function posicionDia(fecha: Date): number {
  return (fecha.getDay() + 6) % 7;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':');
  return Number(h) * 60 + Number(m);
}

function minutosDe(fecha: Date): number {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

/** ¿La jornada cruza la medianoche (cierra de madrugada)? */
export function esNocturno(horario: DefinicionHorario): boolean {
  return minutos(horario.cierre) <= minutos(horario.apertura);
}

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function masMinutos(fecha: Date, min: number): Date {
  return new Date(fecha.getTime() + min * 60_000);
}

/** ¿Hubo un cierre después de la última apertura? */
function cerradoTrasUltimaApertura(aperturas: Date[], cierres: Date[]): boolean {
  const ultima = Math.max(...aperturas.map((a) => a.getTime()));
  return cierres.some((c) => c.getTime() >= ultima);
}

export function esDiaActivo(horario: DefinicionHorario, fecha: Date): boolean {
  return horario.dias[posicionDia(fecha)] !== '-' && horario.dias[posicionDia(fecha)] !== undefined;
}

/** El horario que aplica hoy, o null si el panel no abre hoy. */
export function horarioDelDia(horarios: DefinicionHorario[], fecha: Date): DefinicionHorario | null {
  return horarios.find((h) => esDiaActivo(h, fecha)) ?? null;
}

/**
 * ¿Una apertura en este momento está fuera del horario permitido?
 * Sin horarios cargados no hay supervisión (devuelve false).
 */
export function esAperturaFueraDeHorario(horarios: DefinicionHorario[], fecha: Date): boolean {
  if (horarios.length === 0) return false;
  const hoy = horarioDelDia(horarios, fecha);
  if (!hoy) return true; // día no laborable: cualquier apertura es fuera de horario
  const m = minutosDe(fecha);
  const desde = minutos(hoy.apertura) - hoy.toleranciaMin;
  const hasta = minutos(hoy.cierre) + hoy.toleranciaMin;
  if (minutos(hoy.cierre) < minutos(hoy.apertura)) {
    // Cruza medianoche: permitido desde la apertura o hasta el cierre de la madrugada
    return !(m >= desde || m <= hasta);
  }
  return m < desde || m > hasta;
}

export interface PendientesDia {
  aperturaTarde: boolean;
  sinCierre: boolean;
}

/**
 * Infracciones pendientes: apertura que no llegó a horario y cierre ausente
 * después del horario de cierre. Recibe los movimientos de las últimas ~36 h
 * (en hora del sitio) y decide qué jornada mira cada uno:
 *
 *  - jornada del mismo día: lo de hoy desde la medianoche;
 *  - jornada nocturna de hoy: solo la apertura (el cierre llega mañana);
 *  - jornada nocturna de ayer: el cierre, que vence hoy de madrugada.
 */
export function evaluarPendientesDia(
  horarios: DefinicionHorario[],
  aperturas: Date[],
  cierres: Date[],
  ahora: Date,
): PendientesDia {
  const m = minutosDe(ahora);
  const hoy0 = inicioDelDia(ahora);
  const hoy = horarioDelDia(horarios, ahora);
  const ayer = horarioDelDia(horarios, masMinutos(hoy0, -1));
  const entre = (lista: Date[], desde: Date, hasta: Date) => lista.filter((f) => f >= desde && f < hasta);
  let aperturaTarde = false;
  let sinCierre = false;

  if (hoy && !esNocturno(hoy)) {
    const ap = entre(aperturas, hoy0, masMinutos(hoy0, 24 * 60));
    const ci = entre(cierres, hoy0, masMinutos(hoy0, 24 * 60));
    aperturaTarde = m > minutos(hoy.apertura) + hoy.toleranciaMin && ap.length === 0;
    sinCierre = m > minutos(hoy.cierre) + hoy.toleranciaMin && ap.length > 0 && !cerradoTrasUltimaApertura(ap, ci);
  } else if (hoy) {
    // La jornada de hoy arranca cuando terminó la de anoche (cierre + tolerancia)
    const desde = masMinutos(hoy0, minutos(hoy.cierre) + hoy.toleranciaMin);
    const ap = entre(aperturas, desde, masMinutos(hoy0, 24 * 60));
    aperturaTarde = m > minutos(hoy.apertura) + hoy.toleranciaMin && ap.length === 0;
  }

  if (ayer && esNocturno(ayer) && m > minutos(ayer.cierre) + ayer.toleranciaMin) {
    // La jornada de ayer va de su cierre anterior (ayer de madrugada) hasta hoy a la hora de cierre
    const fin = masMinutos(hoy0, minutos(ayer.cierre) + ayer.toleranciaMin);
    const inicio = masMinutos(fin, -24 * 60);
    const ap = entre(aperturas, inicio, fin);
    const ci = entre(cierres, inicio, fin);
    if (ap.length > 0 && !cerradoTrasUltimaApertura(ap, ci)) sinCierre = true;
  }

  return { aperturaTarde, sinCierre };
}

/**
 * "Ahora" visto desde otro huso horario: devuelve una fecha cuyos getters
 * locales (getHours, getDay…) reflejan la hora del lugar, para poder evaluar
 * los horarios de un sitio que está en otra franja. Sin zona, devuelve la
 * hora del servidor tal cual.
 */
export function ahoraEnZona(zonaHoraria: string | null | undefined, referencia: Date = new Date()): Date {
  if (!zonaHoraria) return referencia;
  try {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(referencia);
    const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
    // La hora 24 aparece en algunos husos como medianoche del día siguiente
    const hora = valor('hour') % 24;
    return new Date(valor('year'), valor('month') - 1, valor('day'), hora, valor('minute'), valor('second'));
  } catch {
    // Huso inválido: se sigue con la hora del servidor en vez de fallar
    return referencia;
  }
}

/** Una fecha vista en la hora del sitio; sin huso propio, en la de la central. */
export function enZona(zonaHoraria: string | null | undefined, fecha: Date = new Date()): Date {
  return ahoraEnZona(zonaHoraria || ZONA_HORARIA_CENTRAL, fecha);
}

/** 'AAAA-MM-DD' de una fecha ya expresada en hora local. */
export function fechaIsoLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}
