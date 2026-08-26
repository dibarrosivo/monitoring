import { and, eq, ne } from 'drizzle-orm';
import {
  CANAL_ALARMAS,
  CANAL_EVENTOS,
  alarma,
  db,
  evento,
  horario,
  notificar,
  panel,
  senal,
  usuarioPanel,
} from '@monitoring/db';
import { interpretarCid, type EventoNormalizado, type FuenteSenal } from '@monitoring/shared';
import { esAperturaFueraDeHorario } from './horarios.js';

/** Categorías que abren una alarma para el operador. Las averías quedan en el registro de eventos. */
const CATEGORIAS_CON_ALARMA = new Set(['alarma', 'cancelacion', 'sistema']);

export interface EntradaSenal {
  fuente: FuenteSenal;
  remoto: string;
  cruda: string;
  estadoParse: 'ok' | 'error' | 'cifrada' | 'ignorada';
  detalleError?: string;
  panelId?: number;
}

/** Persiste la trama cruda. Se llama SIEMPRE antes de responder ACK al emisor. */
export async function registrarSenal(entrada: EntradaSenal): Promise<number> {
  const [fila] = await db
    .insert(senal)
    .values({
      fuente: entrada.fuente,
      remoto: entrada.remoto,
      cruda: entrada.cruda,
      estadoParse: entrada.estadoParse,
      detalleError: entrada.detalleError,
      panelId: entrada.panelId,
    })
    .returning({ id: senal.id });
  return fila!.id;
}

export async function buscarPanelPorCuenta(numeroCuenta: string) {
  const [fila] = await db.select().from(panel).where(eq(panel.numeroCuenta, numeroCuenta)).limit(1);
  return fila ?? null;
}

/** Actualiza la última señal de vida del panel (latidos NULL, pruebas, cualquier evento). */
export async function registrarVida(panelId: number, fecha: Date): Promise<void> {
  await db.update(panel).set({ ultimaSenalEn: fecha }).where(eq(panel.id, panelId));
}

export interface ResultadoEvento {
  eventoId: number;
  alarmaId?: number;
  panelId?: number;
}

/** Inserta el evento decodificado, abre alarma si corresponde y publica en tiempo real. */
export async function procesarEvento(entrada: {
  senalId: number;
  normalizado: EventoNormalizado;
  recibidaEn: Date;
}): Promise<ResultadoEvento> {
  const { senalId, normalizado, recibidaEn } = entrada;
  const panelEncontrado = await buscarPanelPorCuenta(normalizado.numeroCuenta);

  let descripcion = panelEncontrado
    ? normalizado.descripcion
    : `${normalizado.descripcion} — CUENTA DESCONOCIDA (${normalizado.numeroCuenta})`;

  // En los eventos 4xx el campo zona es el número de usuario del teclado:
  // si está dado de alta, el evento nombra a la persona.
  if (
    panelEncontrado &&
    normalizado.zona &&
    ['apertura', 'cierre', 'cancelacion'].includes(normalizado.categoria)
  ) {
    const [personaPanel] = await db
      .select({ nombre: usuarioPanel.nombre })
      .from(usuarioPanel)
      .where(and(eq(usuarioPanel.panelId, panelEncontrado.id), eq(usuarioPanel.numero, normalizado.zona)))
      .limit(1);
    if (personaPanel) descripcion += ` — ${personaPanel.nombre} (cód. ${Number(normalizado.zona)})`;
  }

  const [filaEvento] = await db
    .insert(evento)
    .values({
      senalId,
      panelId: panelEncontrado?.id,
      numeroCuenta: normalizado.numeroCuenta,
      categoria: normalizado.categoria,
      codigo: normalizado.codigo,
      descripcion,
      particion: normalizado.particion,
      zona: normalizado.zona,
      prioridad: normalizado.prioridad,
      // La hora canónica es la de recepción; la marca del panel queda en la trama cruda.
      ocurridoEn: recibidaEn,
    })
    .returning({ id: evento.id });

  if (panelEncontrado) {
    await registrarVida(panelEncontrado.id, recibidaEn);
    await db.update(senal).set({ panelId: panelEncontrado.id }).where(eq(senal.id, senalId));
  }

  let alarmaId: number | undefined;
  // Una cuenta desconocida también requiere atención del operador.
  if (CATEGORIAS_CON_ALARMA.has(normalizado.categoria) || !panelEncontrado) {
    alarmaId = await abrirAlarma({
      eventoId: filaEvento!.id,
      panelId: panelEncontrado?.id,
      prioridad: panelEncontrado ? normalizado.prioridad : 3,
      descripcion,
      numeroCuenta: normalizado.numeroCuenta,
    });
  }

  // Apertura fuera del horario permitido: alguien entró con código válido en un
  // momento en que el sitio debería estar cerrado. Alarma aparte, prioridad alta.
  if (panelEncontrado && normalizado.categoria === 'apertura') {
    const horarios = await db
      .select()
      .from(horario)
      .where(and(eq(horario.panelId, panelEncontrado.id), eq(horario.activo, true)));
    if (esAperturaFueraDeHorario(horarios, recibidaEn)) {
      const descripcionFuera = `Apertura fuera de horario (cuenta ${normalizado.numeroCuenta})`;
      const [filaFuera] = await db
        .insert(evento)
        .values({
          senalId,
          panelId: panelEncontrado.id,
          numeroCuenta: normalizado.numeroCuenta,
          categoria: 'sistema',
          codigo: 'HOR-AF',
          descripcion: descripcionFuera,
          particion: normalizado.particion,
          zona: normalizado.zona,
          prioridad: 2,
          ocurridoEn: recibidaEn,
        })
        .returning({ id: evento.id });
      await abrirAlarma({
        eventoId: filaFuera!.id,
        panelId: panelEncontrado.id,
        prioridad: 2,
        descripcion: descripcionFuera,
        numeroCuenta: normalizado.numeroCuenta,
      });
    }
  }

  await notificar(CANAL_EVENTOS, {
    eventoId: filaEvento!.id,
    panelId: panelEncontrado?.id ?? null,
    categoria: normalizado.categoria,
    codigo: normalizado.codigo,
    descripcion,
    prioridad: normalizado.prioridad,
    numeroCuenta: normalizado.numeroCuenta,
  });

  return { eventoId: filaEvento!.id, alarmaId, panelId: panelEncontrado?.id };
}

export async function abrirAlarma(entrada: {
  eventoId: number;
  panelId?: number;
  prioridad: number;
  descripcion: string;
  numeroCuenta?: string;
}): Promise<number> {
  const [fila] = await db
    .insert(alarma)
    .values({
      eventoId: entrada.eventoId,
      panelId: entrada.panelId,
      prioridad: entrada.prioridad,
      estado: 'nueva',
    })
    .returning({ id: alarma.id });

  await notificar(CANAL_ALARMAS, {
    alarmaId: fila!.id,
    eventoId: entrada.eventoId,
    panelId: entrada.panelId ?? null,
    prioridad: entrada.prioridad,
    descripcion: entrada.descripcion,
    numeroCuenta: entrada.numeroCuenta ?? null,
  });

  return fila!.id;
}

/** ¿El panel ya tiene abierta una alarma de sistema (panel silencioso)? */
export async function tieneAlarmaSistemaAbierta(panelId: number): Promise<boolean> {
  const filas = await db
    .select({ id: alarma.id })
    .from(alarma)
    .innerJoin(evento, eq(alarma.eventoId, evento.id))
    .where(and(eq(alarma.panelId, panelId), eq(evento.categoria, 'sistema'), ne(alarma.estado, 'cerrada')))
    .limit(1);
  return filas.length > 0;
}

export { interpretarCid };
