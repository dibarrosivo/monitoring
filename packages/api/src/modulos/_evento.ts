import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { evento, usuarioPanel, zona } from '@monitoring/db';

/**
 * Piezas que comparten las consultas que listan eventos (la cola de alarmas y
 * el historial). Están acá porque antes cada una llevaba su propia copia de la
 * condición y ya habían quedado distintas: una excluía 'cancelacion' y la otra
 * no, y ninguna contemplaba las alarmas de horario.
 *
 * El campo "zona" de un evento no siempre es una zona. En los 4xx de Contact ID
 * y en las alarmas de horario que derivan de ellos, ese número es el código de
 * usuario del teclado. Por eso se resuelve contra una tabla o contra la otra,
 * nunca contra las dos: ver campoZonaEsUsuario() en @monitoring/shared, que es
 * la misma regla del lado del motor y de la consola.
 */

/** El número es una zona física: ni apertura, ni cierre, ni cancelación, ni horario. */
export const esZonaFisica = and(
  notInArray(evento.categoria, ['apertura', 'cierre', 'cancelacion']),
  sql`${evento.codigo} NOT LIKE 'HOR-%'`,
);

/** Nombre de la zona, solo cuando el número de verdad es una zona. */
export function unirZona(panelId: AnyPgColumn) {
  return and(eq(zona.panelId, panelId), eq(zona.numero, evento.zona), esZonaFisica);
}

/** Nombre de la persona del teclado, solo cuando el número es un código de usuario. */
export function unirUsuarioPanel(panelId: AnyPgColumn) {
  return and(eq(usuarioPanel.panelId, panelId), eq(usuarioPanel.numero, evento.zona), sql`NOT (${esZonaFisica})`);
}
