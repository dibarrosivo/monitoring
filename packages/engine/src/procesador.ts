import { and, eq, ne, or } from 'drizzle-orm';
import {
  alarma,
  CANAL_ALARMAS,
  CANAL_EVENTOS,
  db,
  evento,
  horario,
  notificar,
  panel,
  senal,
  sitio,
  usuarioPanel,
  zona,
} from '@monitoring/db';
import { abreAlarma, interpretarCid, type EventoNormalizado, type FuenteSenal } from '@monitoring/shared';
import { esAperturaFueraDeHorario } from './horarios.js';
import { confirmarPorEvento } from './control/comandos.js';

/** Categorías que abren una alarma para el operador. Las averías quedan en el registro de eventos. */
const CATEGORIAS_CON_ALARMA = new Set(['alarma', 'cancelacion', 'sistema']);

export interface EntradaSenal {
  fuente: FuenteSenal;
  remoto: string;
  cruda: string;
  estadoParse: 'ok' | 'error' | 'cifrada' | 'ignorada';
  detalleError?: string;
  panelId?: number;
  /** 'texto' o 'base64'; las tramas binarias del tap se guardan en base64 */
  codificacion?: 'texto' | 'base64';
  /** Puerto del servidor al que llegó: dice qué receptor la esperaba */
  puertoLocal?: number;
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
      codificacion: entrada.codificacion ?? 'texto',
      puertoLocal: entrada.puertoLocal,
    })
    .returning({ id: senal.id });
  return fila!.id;
}

/**
 * Busca el equipo por su número de cuenta. Contempla la cuenta secundaria:
 * un mismo panel puede reportar con otro número según la vía que use, y sin
 * esto esas señales entrarían como cuenta desconocida.
 */
/**
 * Qué tipos de equipo puede traer cada vía de entrada. Es lo que desempata
 * cuando dos clientes comparten número de cuenta: en la central pasa (la
 * 7037 es a la vez un panel Hikvision de prueba y un transmisor EBS de un
 * cliente real), y el sistema anterior los distingue por el receptor que los
 * trae. Acá la vía cumple ese papel.
 */
const TIPOS_POR_VIA: Partial<Record<FuenteSenal, string[]>> = {
  'dc09-tcp': ['hikvision', 'otro'],
  'dc09-udp': ['hikvision', 'otro'],
  'pima-bridge': ['pima', 'otro'],
  'surgard-tcp': ['ebs', 'otro'],
};

/**
 * Busca el equipo por número de cuenta (principal o secundario).
 *
 * Si un solo equipo tiene ese número, es ese, venga por donde venga. Si hay
 * varios, se elige por la vía por la que llegó la señal. Si aun así no se
 * puede decidir, se devuelve null: la señal entra como cuenta desconocida y
 * un operador la mira, que es mejor que adjudicársela al cliente equivocado.
 */
export async function buscarPanelPorCuenta(numeroCuenta: string, fuente?: FuenteSenal) {
  const filas = await db
    .select()
    .from(panel)
    .where(or(eq(panel.numeroCuenta, numeroCuenta), eq(panel.cuentaSecundaria, numeroCuenta)));
  if (filas.length <= 1) return filas[0] ?? null;

  const preferidos = fuente ? (TIPOS_POR_VIA[fuente] ?? []) : [];
  for (const tipo of preferidos) {
    const candidato = filas.find((f) => f.tipo === tipo);
    if (candidato) return candidato;
  }
  return null;
}

/** Actualiza la última señal de vida del panel (latidos NULL, pruebas, cualquier evento). */
export async function registrarVida(panelId: number, fecha: Date): Promise<void> {
  await db.update(panel).set({ ultimaSenalEn: fecha }).where(eq(panel.id, panelId));
}

/** Nombre del sitio y descripción de la zona (si el evento es por zona), para el aviso hablado. */
async function contextoParaAviso(
  panelId: number,
  sitioId: number | null,
  normalizado: EventoNormalizado,
): Promise<{ sitioNombre?: string | null; zonaDescripcion?: string | null }> {
  const contexto: { sitioNombre?: string | null; zonaDescripcion?: string | null } = {};
  if (sitioId) {
    const [s] = await db.select({ nombre: sitio.nombre }).from(sitio).where(eq(sitio.id, sitioId)).limit(1);
    contexto.sitioNombre = s?.nombre ?? null;
  }
  // En aperturas y cierres el campo zona es el usuario, no una zona física
  if (normalizado.zona && !['apertura', 'cierre', 'cancelacion'].includes(normalizado.categoria)) {
    const [z] = await db
      .select({ descripcion: zona.descripcion })
      .from(zona)
      .where(and(eq(zona.panelId, panelId), eq(zona.numero, normalizado.zona)))
      .limit(1);
    contexto.zonaDescripcion = z?.descripcion ?? null;
  }
  return contexto;
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
  /** Vía por la que llegó: desempata cuando dos equipos comparten número de cuenta */
  fuente?: FuenteSenal;
}): Promise<ResultadoEvento> {
  const { senalId, normalizado, recibidaEn } = entrada;
  const panelEncontrado = await buscarPanelPorCuenta(normalizado.numeroCuenta, entrada.fuente);

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
  /*
   * Abre alarma si la categoría lo amerita y el catálogo de protocolos no lo
   * excluye. Una cuenta desconocida abre siempre: alguien transmite y nadie lo
   * mira, que es de las cosas que no se pueden dejar pasar.
   */
  const correspondeAlarma =
    CATEGORIAS_CON_ALARMA.has(normalizado.categoria) &&
    abreAlarma({ codigo: normalizado.codigo, codigoCid: normalizado.codigoCid });
  if (correspondeAlarma || !panelEncontrado) {
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

  /*
   * Si este evento prueba que el panel cambió de estado, confirma el comando
   * que lo pidió. Que el fabricante acepte la orden no significa que el panel
   * haya obedecido: la única confirmación que vale es la que transmite el panel.
   */
  if (panelEncontrado && ['apertura', 'cierre'].includes(normalizado.categoria)) {
    await confirmarPorEvento({
      panelId: panelEncontrado.id,
      codigo: normalizado.codigo,
      eventoId: filaEvento!.id,
      ocurridoEn: recibidaEn,
    });
  }

  /*
   * El aviso en tiempo real lleva lo que hace falta para DECIRLO, no solo para
   * mostrarlo: la app del cliente lo lee en voz alta ("alarma en zona 3,
   * cocina, en Panadería K3"). Nombrar la zona y el sitio evita que la app
   * tenga que volver a preguntar antes de hablar.
   */
  const contexto = panelEncontrado ? await contextoParaAviso(panelEncontrado.id, panelEncontrado.sitioId, normalizado) : {};
  await notificar(CANAL_EVENTOS, {
    eventoId: filaEvento!.id,
    panelId: panelEncontrado?.id ?? null,
    categoria: normalizado.categoria,
    codigo: normalizado.codigo,
    descripcion,
    prioridad: normalizado.prioridad,
    numeroCuenta: normalizado.numeroCuenta,
    prefijo: panelEncontrado?.prefijo ?? null,
    zona: normalizado.zona || null,
    ...contexto,
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
