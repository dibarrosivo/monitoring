import type { CategoriaEvento } from './tipos.js';

/** Clases estáticas (Tailwind las detecta en el código fuente, no se pueden armar dinámicamente). */

export function clasesPrioridad(prioridad: number): { barra: string; texto: string; borde: string } {
  if (prioridad <= 1) return { barra: 'bg-prio1', texto: 'text-prio1', borde: 'border-prio1' };
  if (prioridad === 2) return { barra: 'bg-prio2', texto: 'text-prio2', borde: 'border-prio2' };
  return { barra: 'bg-prio3', texto: 'text-prio3', borde: 'border-prio3' };
}

export function textoCategoria(categoria: CategoriaEvento, prioridad: number): string {
  switch (categoria) {
    case 'alarma':
      return prioridad <= 1 ? 'text-prio1' : 'text-prio2';
    case 'sistema':
    case 'apertura':
      return 'text-prio3';
    case 'restauracion':
    case 'cierre':
      return 'text-ok';
    case 'averia':
    case 'anulacion':
    case 'cancelacion':
      return 'text-prio2';
    default:
      return 'text-tenue';
  }
}

export const NOMBRE_CATEGORIA: Record<CategoriaEvento, string> = {
  alarma: 'Alarma',
  restauracion: 'Restauración',
  apertura: 'Apertura',
  cierre: 'Cierre',
  averia: 'Avería',
  anulacion: 'Anulación',
  prueba: 'Prueba',
  cancelacion: 'Cancelación',
  sistema: 'Sistema',
  desconocido: 'Desconocido',
};
