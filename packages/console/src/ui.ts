import type { CategoriaEvento, TipoSenal } from './tipos.js';

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

/** Nombre de la cuenta como la nombra la central: prefijo y número (HIK-7037, AL-7048). */
export function nombreCuenta(prefijo: string | null | undefined, numero: string | null | undefined): string {
  if (!numero) return '—';
  return prefijo ? `${prefijo}-${numero}` : numero;
}

export const NOMBRE_TIPO_PANEL: Record<string, string> = { hikvision: 'Hikvision', pima: 'PIMA', ebs: 'EBS', otro: 'Otro' };

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

/**
 * Código de color por tipo de señal, el mismo en la cola, el diario y la app.
 * Sigue la convención de las centrales (y del software anterior): emergencia
 * rojo, robo naranja, avería amarillo, horario violeta, apertura/cierre verde,
 * restauración azul, prueba magenta, sistema gris. Las clases van escritas
 * completas porque Tailwind las busca en el código fuente.
 */
export const CLASES_TIPO: Record<TipoSenal, { texto: string; barra: string; fondo: string; borde: string }> = {
  emergencia: { texto: 'text-tipo-emergencia', barra: 'bg-tipo-emergencia', fondo: 'bg-tipo-emergencia/15', borde: 'border-tipo-emergencia' },
  robo: { texto: 'text-tipo-robo', barra: 'bg-tipo-robo', fondo: 'bg-tipo-robo/15', borde: 'border-tipo-robo' },
  averia: { texto: 'text-tipo-averia', barra: 'bg-tipo-averia', fondo: 'bg-tipo-averia/15', borde: 'border-tipo-averia' },
  horario: { texto: 'text-tipo-horario', barra: 'bg-tipo-horario', fondo: 'bg-tipo-horario/15', borde: 'border-tipo-horario' },
  apertura_cierre: { texto: 'text-tipo-apertura', barra: 'bg-tipo-apertura', fondo: 'bg-tipo-apertura/15', borde: 'border-tipo-apertura' },
  restauracion: { texto: 'text-tipo-restauracion', barra: 'bg-tipo-restauracion', fondo: 'bg-tipo-restauracion/15', borde: 'border-tipo-restauracion' },
  anulacion: { texto: 'text-tipo-anulacion', barra: 'bg-tipo-anulacion', fondo: 'bg-tipo-anulacion/15', borde: 'border-tipo-anulacion' },
  prueba: { texto: 'text-tipo-prueba', barra: 'bg-tipo-prueba', fondo: 'bg-tipo-prueba/15', borde: 'border-tipo-prueba' },
  sistema: { texto: 'text-tipo-sistema', barra: 'bg-tipo-sistema', fondo: 'bg-tipo-sistema/15', borde: 'border-tipo-sistema' },
};

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

/** De lo urgente a lo informativo: así se listan en la leyenda y en los filtros. */
export const ORDEN_TIPOS_SENAL: TipoSenal[] = ['emergencia', 'robo', 'averia', 'horario', 'apertura_cierre', 'restauracion', 'anulacion', 'prueba', 'sistema'];

/** Tipo de un evento; si la respuesta no lo trae (versión vieja de la API), se aproxima por categoría. */
export function tipoDe(evento: { tipo?: TipoSenal; categoria: CategoriaEvento; prioridad?: number }): TipoSenal {
  if (evento.tipo) return evento.tipo;
  switch (evento.categoria) {
    case 'alarma':
      return (evento.prioridad ?? 2) <= 1 ? 'emergencia' : 'robo';
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
      return 'sistema';
  }
}

/** ¿La alarma sigue en verificación (esperando el desarmado del usuario)? */
export function enVerificacion(alarma: { estado: string; enVerificacionHasta?: string | null }, ahora: number = Date.now()): boolean {
  return alarma.estado === 'nueva' && Boolean(alarma.enVerificacionHasta) && new Date(alarma.enVerificacionHasta!).getTime() > ahora;
}

/** ¿La cuenta está en prueba en este momento? */
export function enPrueba(panel: { enPruebaHasta?: string | null } | null | undefined, ahora: number = Date.now()): boolean {
  return Boolean(panel?.enPruebaHasta) && new Date(panel!.enPruebaHasta!).getTime() > ahora;
}

/** Cómo terminó un aviso push, en una palabra y un color. */
export function resumenAviso(a: { resultado: string; recibidoEn: string | null; voz: string | null }): { texto: string; clase: string } {
  if (a.recibidoEn) {
    const hablo = a.voz ? /speak=0/.test(a.voz) : false;
    return { texto: hablo ? 'recibido y hablado' : 'recibido', clase: 'text-ok' };
  }
  switch (a.resultado) {
    case 'enviado':
      return { texto: 'enviado, sin acuse', clase: 'text-prio3' };
    case 'omitido':
      return { texto: 'apagado por el cliente', clase: 'text-tenue' };
    case 'sin-telefono':
      return { texto: 'sin teléfono registrado', clase: 'text-tenue' };
    case 'token-invalido':
      return { texto: 'teléfono dado de baja', clase: 'text-prio2' };
    default:
      return { texto: 'no entregado', clase: 'text-prio1' };
  }
}
