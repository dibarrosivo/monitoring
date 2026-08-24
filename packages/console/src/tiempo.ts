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
