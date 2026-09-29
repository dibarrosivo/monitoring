/**
 * Dinero. Los planes y las cuotas están en dólares; a bolívares se convierte
 * al momento de mostrar, con la tasa vigente del BCV. Nunca se guarda un
 * monto en bolívares: cambia todos los días.
 */

/** Bolívares que corresponden a un monto en dólares, redondeado al céntimo. */
export function usdABs(montoUsd: number, tasa: number): number {
  return Math.round(montoUsd * tasa * 100) / 100;
}

export function formatearUsd(monto: number): string {
  return `US$ ${monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatearBs(monto: number): string {
  return `Bs ${monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Bs 855,66 por US$ (BCV 25/09)": cómo se nombra la tasa en pantalla. */
export function describirTasa(tasa: { valor: number; fechaValor: string; fuente: string }): string {
  const [a, m, d] = tasa.fechaValor.split('-');
  return `Bs ${tasa.valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por US$ (${tasa.fuente === 'bcv' ? 'BCV' : 'manual'} ${d}/${m}/${a})`;
}
