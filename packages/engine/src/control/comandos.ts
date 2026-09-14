import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { comando, db, panel } from '@monitoring/db';
import { crearProveedorHikvision } from './hikvision.js';
import { proveedorPara, registrarProveedor, type AccionComando, type EstadoParticion } from './proveedor.js';

/**
 * Envío y seguimiento de comandos a los paneles.
 *
 * Hikvision es el único tipo con control: los demás reportan por vías de un
 * solo sentido. Ver `proveedor.ts` para el porqué.
 */
registrarProveedor('hikvision', crearProveedorHikvision);

export interface ResultadoEnvio {
  comandoId: number;
  aceptado: boolean;
  detalle?: string;
}

/**
 * Envía un comando y lo deja registrado pase lo que pase.
 *
 * El registro se crea ANTES de llamar al fabricante, igual que con las tramas:
 * si el proceso muere en el medio, queda el rastro de que alguien pidió
 * desarmar un local. Un comando sin registro es peor que un comando fallido.
 */
export async function enviarComando(entrada: {
  panelId: number;
  usuarioId: number;
  accion: AccionComando;
  particion?: string;
}): Promise<ResultadoEnvio> {
  const particion = entrada.particion ?? '01';
  const [equipo] = await db.select().from(panel).where(eq(panel.id, entrada.panelId)).limit(1);
  if (!equipo) throw new Error('Equipo no encontrado');

  const [fila] = await db
    .insert(comando)
    .values({
      panelId: entrada.panelId,
      usuarioId: entrada.usuarioId,
      accion: entrada.accion,
      particion,
      estado: 'pendiente',
    })
    .returning({ id: comando.id });
  const comandoId = fila!.id;

  const proveedor = proveedorPara(equipo.tipo);
  const resultado = await proveedor.enviar({
    serial: equipo.serial ?? '',
    accion: entrada.accion,
    particion,
  });

  await db
    .update(comando)
    .set({
      estado: resultado.aceptado ? 'enviado' : 'fallido',
      detalle: resultado.detalle,
      resueltoEn: resultado.aceptado ? null : new Date(),
    })
    .where(eq(comando.id, comandoId));

  return { comandoId, aceptado: resultado.aceptado, detalle: resultado.detalle };
}

/** Códigos Contact ID de apertura y cierre por usuario: son los que confirman. */
const CODIGOS_CONFIRMAN: Record<AccionComando, string[]> = {
  armar: ['R401'],
  armar_casa: ['R401', 'R441'],
  desarmar: ['E401'],
};

/**
 * Cierra el círculo: un comando pasa a 'confirmado' cuando llega por la vía de
 * REPORTE el evento que prueba que el panel cambió de estado.
 *
 * Que el fabricante acepte la orden no significa que el panel haya obedecido:
 * pudo estar sin energía, con una zona abierta o sin cobertura. La única
 * confirmación que vale es el evento que el propio panel transmite después.
 *
 * Se llama desde el procesador cuando entra un evento de apertura o cierre.
 */
export async function confirmarPorEvento(entrada: {
  panelId: number;
  codigo: string;
  eventoId: number;
  ocurridoEn: Date;
}): Promise<number | null> {
  const acciones = (Object.keys(CODIGOS_CONFIRMAN) as AccionComando[]).filter((a) =>
    CODIGOS_CONFIRMAN[a].includes(entrada.codigo),
  );
  if (acciones.length === 0) return null;

  // Solo comandos recientes: un evento de hoy no confirma una orden de ayer.
  // Cinco minutos alcanzan de sobra para un panel con cobertura normal.
  const desde = new Date(entrada.ocurridoEn.getTime() - 5 * 60_000);
  const [pendiente] = await db
    .select({ id: comando.id })
    .from(comando)
    .where(
      and(
        eq(comando.panelId, entrada.panelId),
        eq(comando.estado, 'enviado'),
        inArray(comando.accion, acciones),
        gte(comando.creadoEn, desde),
      ),
    )
    .orderBy(desc(comando.creadoEn))
    .limit(1);
  if (!pendiente) return null;

  await db
    .update(comando)
    .set({ estado: 'confirmado', eventoConfirmaId: entrada.eventoId, resueltoEn: new Date() })
    .where(eq(comando.id, pendiente.id));
  return pendiente.id;
}

/**
 * Estado real de las particiones, preguntado al panel a través del fabricante.
 * Devuelve null cuando el tipo de equipo no sabe informarlo.
 */
export async function estadoArmado(panelId: number): Promise<EstadoParticion[] | null> {
  const [equipo] = await db.select().from(panel).where(eq(panel.id, panelId)).limit(1);
  if (!equipo?.serial) return null;
  const proveedor = proveedorPara(equipo.tipo);
  if (!proveedor.consultarEstado) return null;
  return proveedor.consultarEstado(equipo.serial);
}

/** Últimos comandos de un equipo, para la ficha y la auditoría. */
export async function historialComandos(panelId: number, limite = 20) {
  return db
    .select({
      id: comando.id,
      accion: comando.accion,
      particion: comando.particion,
      estado: comando.estado,
      detalle: comando.detalle,
      creadoEn: comando.creadoEn,
      resueltoEn: comando.resueltoEn,
      usuarioId: comando.usuarioId,
    })
    .from(comando)
    .where(eq(comando.panelId, panelId))
    .orderBy(desc(comando.creadoEn))
    .limit(limite);
}

export { admiteControl, proveedorPara, registrarProveedor, SIN_CONTROL } from './proveedor.js';
export type { AccionComando, EstadoParticion, ProveedorControl, ResultadoComando } from './proveedor.js';
