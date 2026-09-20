import type { CategoriaEvento } from './tipos.js';

/**
 * Tipo de señal: la familia a la que pertenece un evento para el operador,
 * con un color fijo en toda la consola. Es la misma idea que los "grupos de
 * códigos de alarma" del software anterior (emergencias rojo, fallas naranja,
 * restauraciones azul, aperturas/cierres verde, pruebas magenta), llevada a
 * las categorías que ya calcula cada protocolo. No se guarda en la base: se
 * deriva del evento al responder, así un cambio de criterio aplica también
 * al historial.
 */
export type TipoSenal =
  | 'emergencia'
  | 'robo'
  | 'averia'
  | 'horario'
  | 'apertura_cierre'
  | 'restauracion'
  | 'anulacion'
  | 'prueba'
  | 'sistema';

export const NOMBRE_TIPO_SENAL: Record<TipoSenal, string> = {
  emergencia: 'Emergencia',
  robo: 'Robo',
  averia: 'Avería',
  horario: 'Horario',
  apertura_cierre: 'Apertura / cierre',
  restauracion: 'Restauración',
  anulacion: 'Anulación',
  prueba: 'Prueba',
  sistema: 'Sistema',
};

/** Orden en que se listan los tipos (leyenda, filtros): de lo urgente a lo informativo. */
export const ORDEN_TIPOS_SENAL: TipoSenal[] = ['emergencia', 'robo', 'averia', 'horario', 'apertura_cierre', 'restauracion', 'anulacion', 'prueba', 'sistema'];

/** Códigos PIMA de control de horario: aperturas y cierres tarde o temprano, no abrió, no cerró, aviso previo. */
const PIMA_HORARIO = new Set(['OA', 'OM', 'OT', 'SP', 'SQ', 'SR', 'SS', 'TO', 'TP', 'SW']);

export function tipoSenal(evento: { codigo: string; categoria: CategoriaEvento; prioridad: number }): TipoSenal {
  const { codigo, categoria, prioridad } = evento;
  // Control de horario: lo genera el motor (HOR-*), lo reporta PIMA con códigos
  // propios, y en Contact ID son los 45x (apertura/cierre tarde o temprano, no abrió, no cerró)
  if (codigo.startsWith('HOR-')) return 'horario';
  if (codigo.startsWith('PIMA-') && PIMA_HORARIO.has(codigo.slice(5))) return 'horario';
  const cid = /^[ER](\d{3})$/.exec(codigo)?.[1];
  if (cid && cid >= '450' && cid <= '455') return 'horario';
  switch (categoria) {
    case 'alarma':
      // Fuego, pánico, coacción, médica, gas: prioridad 1 en la tabla Contact ID
      return prioridad <= 1 ? 'emergencia' : 'robo';
    case 'restauracion':
      return 'restauracion';
    case 'apertura':
    case 'cierre':
    case 'cancelacion':
      return 'apertura_cierre';
    case 'averia':
      return 'averia';
    case 'anulacion':
      return 'anulacion';
    case 'prueba':
      return 'prueba';
    default:
      return prioridad <= 1 ? 'emergencia' : 'sistema';
  }
}
