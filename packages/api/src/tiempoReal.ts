import { and, eq, isNull, or } from 'drizzle-orm';
import { acceso, cliente, db, panel, sitio } from '@monitoring/db';
import type { CargaJwt } from './tipos.js';

/**
 * Quién recibe qué por el canal en tiempo real.
 *
 * El personal de la central ve todo. Un usuario de la app de clientes ve
 * SOLO los eventos de los paneles que sus accesos alcanzan: es la misma regla
 * que aplica la API en cada pedido, llevada al WebSocket. Sin este filtro,
 * cualquier cliente con sesión vería pasar las alarmas de todos los demás.
 *
 * El alcance se recalcula cada tanto y no en cada mensaje: revocar un acceso
 * tarda como mucho un minuto en cortar el tiempo real, y no cuesta una
 * consulta por evento por cliente conectado.
 */

const VIGENCIA_ALCANCE_MS = 60_000;

export interface Suscriptor {
  usuarioId: number;
  rol: CargaJwt['rol'];
  /** null = sin restricción (personal de la central) */
  paneles: Set<number> | null;
  alcanceCalculadoEn: number;
}

/** Ids de los paneles que el usuario puede ver, según la tabla de accesos. */
export async function idsPanelesDelUsuario(usuarioId: number): Promise<Set<number>> {
  const filas = await db
    .selectDistinct({ id: panel.id })
    .from(panel)
    .innerJoin(sitio, eq(panel.sitioId, sitio.id))
    .innerJoin(cliente, eq(sitio.clienteId, cliente.id))
    .innerJoin(
      acceso,
      and(
        eq(acceso.usuarioId, usuarioId),
        eq(acceso.clienteId, cliente.id),
        or(
          eq(acceso.panelId, panel.id),
          and(isNull(acceso.panelId), eq(acceso.sitioId, sitio.id)),
          and(isNull(acceso.panelId), isNull(acceso.sitioId)),
        ),
      ),
    );
  return new Set(filas.map((f) => f.id));
}

export async function crearSuscriptor(usuario: CargaJwt): Promise<Suscriptor> {
  const restringido = usuario.rol === 'cliente';
  return {
    usuarioId: usuario.id,
    rol: usuario.rol,
    paneles: restringido ? await idsPanelesDelUsuario(usuario.id) : null,
    alcanceCalculadoEn: Date.now(),
  };
}

/** Refresca el alcance de un cliente si ya venció; el personal no lo necesita. */
export async function refrescarAlcance(s: Suscriptor, ahora = Date.now()): Promise<void> {
  if (s.paneles === null || ahora - s.alcanceCalculadoEn < VIGENCIA_ALCANCE_MS) return;
  s.paneles = await idsPanelesDelUsuario(s.usuarioId);
  s.alcanceCalculadoEn = ahora;
}

/**
 * ¿Este suscriptor debe recibir este mensaje? Pura, para poder probarla.
 * Un evento sin panel (cuenta desconocida) es asunto de la central, nunca de
 * un cliente.
 */
export function debeRecibir(s: Suscriptor, carga: { panelId?: number | null } | null): boolean {
  if (s.paneles === null) return true;
  const panelId = carga?.panelId;
  return typeof panelId === 'number' && s.paneles.has(panelId);
}
