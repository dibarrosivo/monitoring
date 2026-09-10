/** Formato de fechas y tiempos transcurridos para la consola. */

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fechaHora(iso: string): string {
  const fecha = new Date(iso);
  return `${fecha.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })} ${horaCorta(iso)}`;
}

/** "hace 2 min", "hace 3 h" — el tiempo sin atender es el dato operativo clave. */
export function transcurrido(iso: string, ahora: number = Date.now()): string {
  const segundos = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 1000));
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h ${minutos % 60} min`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d ${horas % 24} h`;
}

/**
 * Duración compacta para los cronómetros de la cola: "42s", "3m12s", "1h04m".
 * Se prioriza que se lea de un vistazo por encima de la precisión.
 */
export function duracionCorta(ms: number): string {
  const seg = Math.max(0, Math.floor(ms / 1000));
  if (seg < 60) return `${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min}m${String(seg % 60).padStart(2, '0')}s`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m`;
}
