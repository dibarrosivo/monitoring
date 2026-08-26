/**
 * Lógica pura de supervisión de horarios (sin base de datos, para poder probarla).
 * v1 cubre horarios dentro del mismo día (apertura < cierre); un horario que
 * cruza medianoche solo se supervisa para "apertura fuera de horario".
 */

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
 * Infracciones pendientes del día: apertura que no llegó a horario y cierre
 * ausente después del horario de cierre.
 */
export function evaluarPendientesDia(
  horarios: DefinicionHorario[],
  aperturasHoy: Date[],
  cierresHoy: Date[],
  ahora: Date,
): PendientesDia {
  const hoy = horarioDelDia(horarios, ahora);
  if (!hoy || minutos(hoy.cierre) < minutos(hoy.apertura)) {
    return { aperturaTarde: false, sinCierre: false };
  }
  const m = minutosDe(ahora);

  const huboApertura = aperturasHoy.length > 0;
  const aperturaTarde = m > minutos(hoy.apertura) + hoy.toleranciaMin && !huboApertura;

  const ultimaApertura = aperturasHoy.at(-1)?.getTime() ?? 0;
  const huboCierrePosterior = cierresHoy.some((c) => c.getTime() >= ultimaApertura);
  const sinCierre = m > minutos(hoy.cierre) + hoy.toleranciaMin && huboApertura && !huboCierrePosterior;

  return { aperturaTarde, sinCierre };
}
