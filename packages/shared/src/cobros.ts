/**
 * Cobros: planes en dólares por dispositivo, cuotas por período y pagos
 * que se aplican a las cuotas más viejas primero. Estas reglas son puras
 * (fechas, repartos, textos) y las usan la API, la consola y la app.
 *
 * Decisiones: control interno (no es facturación fiscal); la mora solo se
 * marca y se avisa, nunca corta el monitoreo; el plan se asigna por
 * dispositivo y el estado de cuenta se lleva por cliente.
 */

export const FORMAS_PAGO = ['pago_movil', 'transferencia', 'efectivo', 'zelle', 'tarjeta', 'deposito', 'otro'] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export const NOMBRE_FORMA_PAGO: Record<FormaPago, string> = {
  pago_movil: 'Pago móvil',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  zelle: 'Zelle',
  tarjeta: 'Tarjeta',
  deposito: 'Depósito',
  otro: 'Otro',
};

export type EstadoCuota = 'pendiente' | 'pagada' | 'anulada';
export type EstadoPago = 'confirmado' | 'por_confirmar' | 'anulado';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number);
  return [a ?? 1970, (m ?? 1) - 1, d ?? 1];
}

function iso(a: number, m: number, d: number): string {
  const f = new Date(Date.UTC(a, m, d));
  return f.toISOString().slice(0, 10);
}

/** Suma meses a una fecha 'AAAA-MM-DD' conservando el día cuando existe (31/01 + 1 mes = 28/02). */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = partes(fecha);
  const ultimoDia = new Date(Date.UTC(a, m + meses + 1, 0)).getUTCDate();
  return iso(a, m + meses, Math.min(d, ultimoDia));
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = partes(fecha);
  return iso(a, m, d + dias);
}

/** El período que empieza en `desde` y dura `meses`: termina el día anterior al siguiente inicio. */
export function periodoDesde(desde: string, meses: number): { desde: string; hasta: string; siguiente: string } {
  const siguiente = sumarMeses(desde, meses);
  return { desde, hasta: sumarDias(siguiente, -1), siguiente };
}

export function fechaCorta(fecha: string): string {
  const [a, m, d] = partes(fecha);
  return `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${a}`;
}

/** "Mensualidad de octubre 2026" o, con otra frecuencia, "Servicio del 01/10/2026 al 31/12/2026". */
export function conceptoCuota(desde: string, hasta: string, meses: number): string {
  const [a, m, d] = partes(desde);
  if (meses === 1 && d === 1) return `Mensualidad de ${MESES[m]} ${a}`;
  if (meses === 1) return `Mensualidad del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  return `Servicio del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
}

export interface CuotaAbierta {
  id: number;
  montoUsd: number;
  pagadoUsd: number;
}

/**
 * Reparte un pago entre cuotas, la más vieja primero. Devuelve qué se
 * aplicó a cada una y lo que sobra (queda como saldo a favor del cliente).
 */
export function repartirPago(montoUsd: number, cuotas: CuotaAbierta[]): { aplicado: { cuotaId: number; montoUsd: number }[]; sobrante: number } {
  let resto = Math.round(montoUsd * 100);
  const aplicado: { cuotaId: number; montoUsd: number }[] = [];
  for (const c of cuotas) {
    if (resto <= 0) break;
    const falta = Math.round((c.montoUsd - c.pagadoUsd) * 100);
    if (falta <= 0) continue;
    const parte = Math.min(falta, resto);
    aplicado.push({ cuotaId: c.id, montoUsd: parte / 100 });
    resto -= parte;
  }
  return { aplicado, sobrante: resto / 100 };
}

/** Cómo se ve una cuota hoy: pagada, anulada, vencida (pendiente y pasada de fecha) o pendiente. */
export function situacionCuota(c: { estado: EstadoCuota; venceEn: string }, hoy: string): 'pagada' | 'anulada' | 'vencida' | 'pendiente' {
  if (c.estado !== 'pendiente') return c.estado;
  return c.venceEn < hoy ? 'vencida' : 'pendiente';
}
