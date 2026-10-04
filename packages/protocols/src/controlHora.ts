/**
 * Control de repetición para DC-09 cifrado.
 *
 * Cifrar sin esto protege a medias: alguien que capture una trama cifrada (un
 * desarmado, por ejemplo) puede reenviarla tal cual más tarde, y el receptor la
 * descifraría sin problema. El estándar lo resuelve con la hora que trae la
 * trama: el receptor rechaza la que se aparte demasiado de su propia hora, y en
 * el NAK le manda la hora correcta para que el panel ajuste su reloj.
 *
 * Ventana del estándar SIA DC-09: hasta 20 s adelantada y 40 s atrasada.
 * Medido en producción (octubre de 2026): los Hikvision llegan con 2 a 3,5 s de
 * demora, así que la ventana sobra.
 */
export interface VentanaHora {
  /** Segundos que la trama puede venir adelantada respecto del receptor */
  adelantoSeg: number;
  /** Segundos que la trama puede venir atrasada (tránsito, reintentos) */
  atrasoSeg: number;
}

export const VENTANA_DC09: VentanaHora = { adelantoSeg: 20, atrasoSeg: 40 };

export type ResultadoHora =
  | { ok: true; atrasoSeg: number }
  | { ok: false; motivo: 'sin-hora' }
  | { ok: false; motivo: 'fuera-de-ventana'; atrasoSeg: number };

/** atrasoSeg > 0: la trama dice una hora anterior a la del receptor. */
export function evaluarHora(marca: Date | undefined, ahora: Date, ventana: VentanaHora = VENTANA_DC09): ResultadoHora {
  if (!marca || Number.isNaN(marca.getTime())) return { ok: false, motivo: 'sin-hora' };
  const atrasoSeg = Math.round((ahora.getTime() - marca.getTime()) / 1000);
  if (atrasoSeg > ventana.atrasoSeg || -atrasoSeg > ventana.adelantoSeg) {
    return { ok: false, motivo: 'fuera-de-ventana', atrasoSeg };
  }
  return { ok: true, atrasoSeg };
}
