import { campoZonaEsUsuario } from '@monitoring/shared';
import type { CategoriaEvento } from './tipos.js';

/**
 * Qué significa el número que trae un evento. En las alarmas y las averías es
 * una zona física; en los 4xx de Contact ID (apertura, cierre, cancelación) y
 * en las alarmas de horario que derivan de ellos es el código de usuario del
 * teclado, o sea quién armó o desarmó.
 *
 * Existe para que esa regla esté en un solo lugar: estaba copiada en la
 * consola, en la app del cliente, en el motor y en dos consultas de la API, y
 * ya habían quedado distintas entre sí. El resultado era que una apertura
 * mostraba «zona 001 - INFRARROJO ENTRADA», que es una zona que no tuvo nada
 * que ver con lo que pasó.
 */
export interface NumeroDelEvento {
  /** 'usuario' o 'zona', para rotularlo donde el encabezado no lo diga */
  rotulo: 'usuario' | 'zona';
  /** Sin los ceros de adelante cuando es un número ('007' → '7') */
  numero: string;
  /** El nombre de la persona o la descripción de la zona, si se conoce */
  nombre: string | null;
}

export function numeroDelEvento(evento: {
  codigo: string;
  categoria: CategoriaEvento;
  zona: string | null;
  zonaDescripcion?: string | null;
  usuarioPanelNombre?: string | null;
}): NumeroDelEvento | null {
  if (!evento.zona) return null;
  const esUsuario = campoZonaEsUsuario(evento);
  return {
    rotulo: esUsuario ? 'usuario' : 'zona',
    numero: String(Number(evento.zona) || evento.zona),
    nombre: (esUsuario ? evento.usuarioPanelNombre : evento.zonaDescripcion) ?? null,
  };
}
