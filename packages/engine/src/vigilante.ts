import { and, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { accionAlarma, alarma, bridge, CANAL_EVENTOS, db, evento, feriado, horario, notificar, panel, senal, sitio } from '@monitoring/db';
import { abrirAlarma, tieneAlarmaSistemaAbierta } from './procesador.js';
import { enZona, evaluarPendientesDia, fechaIsoLocal, ZONA_HORARIA_CENTRAL } from './horarios.js';
import { LATIDOS_PERDIDOS_PUENTE, SILENCIO_GENERAL_MIN_POR_DEFECTO } from '@monitoring/shared';

/**
 * Vigilante de paneles silenciosos: en este rubro el silencio es en sí una emergencia
 * (panel muerto, línea cortada, sabotaje). Si un panel supervisado no envía señales
 * en 1.5 veces su intervalo de prueba, se abre una alarma de sistema.
 */

const FACTOR_TOLERANCIA = 1.5;

export async function revisarPanelesSilenciosos(): Promise<number> {
  const silenciosos = await db
    .select({
      id: panel.id,
      numeroCuenta: panel.numeroCuenta,
      intervaloPruebaMin: panel.intervaloPruebaMin,
      ultimaSenalEn: panel.ultimaSenalEn,
      creadoEn: panel.creadoEn,
    })
    .from(panel)
    .where(
      and(
        eq(panel.activo, true),
        eq(panel.supervisado, true),
        // Una cuenta en prueba (técnico trabajando) no cuenta como silenciosa
        sql`(${panel.enPruebaHasta} IS NULL OR ${panel.enPruebaHasta} < now())`,
        // 1.5 × intervalo en minutos = intervalo × 90 segundos (el factor no puede ir
        // como parámetro: Postgres lo infiere entero y rechaza "1.5")
        sql`COALESCE(${panel.ultimaSenalEn}, ${panel.creadoEn}) < now() - (${panel.intervaloPruebaMin} * interval '90 seconds')`,
      ),
    );

  let abiertas = 0;
  for (const p of silenciosos) {
    if (await tieneAlarmaSistemaAbierta(p.id)) continue;
    /*
     * Un aviso por episodio de silencio, no uno por minuto: si ya se avisó
     * desde la última señal del panel y el operador lo cerró, no se vuelve a
     * abrir hasta que el panel reporte y se calle de nuevo. Como red, se
     * recuerda una vez al día mientras siga mudo.
     */
    if (await yaAvisadoSilencio(p.id, p.ultimaSenalEn ?? p.creadoEn)) continue;

    const descripcion = `Panel silencioso: sin señales hace más de ${duracionLegible(
      Math.round(p.intervaloPruebaMin * FACTOR_TOLERANCIA),
    )}`;

    const [filaEvento] = await db
      .insert(evento)
      .values({
        panelId: p.id,
        numeroCuenta: p.numeroCuenta,
        categoria: 'sistema',
        codigo: 'SIS',
        descripcion,
        prioridad: 3,
        ocurridoEn: new Date(),
      })
      .returning({ id: evento.id });

    await abrirAlarma({
      eventoId: filaEvento!.id,
      panelId: p.id,
      prioridad: 3,
      descripcion,
      numeroCuenta: p.numeroCuenta,
    });

    await avisarAlPersonal(filaEvento!.id, 'SIS', descripcion, 2, { panelId: p.id, numeroCuenta: p.numeroCuenta });
    abiertas++;
  }
  return abiertas;
}

/** ¿Ya se avisó el silencio de este panel desde su última señal, en las últimas 24 h? */
async function yaAvisadoSilencio(panelId: number, desde: Date): Promise<boolean> {
  const piso = new Date(Math.max(desde.getTime(), Date.now() - 24 * 60 * 60_000));
  const filas = await db
    .select({ id: evento.id })
    .from(evento)
    .where(and(eq(evento.panelId, panelId), eq(evento.codigo, 'SIS'), gte(evento.ocurridoEn, piso)))
    .limit(1);
  return filas.length > 0;
}

/** Un evento de sistema con este código ya generado hoy para el panel (para no duplicar). */
async function yaAvisadoHoy(panelId: number, codigo: string, inicioDia: Date): Promise<boolean> {
  const filas = await db
    .select({ id: evento.id })
    .from(evento)
    .where(and(eq(evento.panelId, panelId), eq(evento.codigo, codigo), gte(evento.ocurridoEn, inicioDia)))
    .limit(1);
  return filas.length > 0;
}

async function abrirAlarmaHorario(panelId: number, numeroCuenta: string, codigo: string, descripcion: string) {
  const [fila] = await db
    .insert(evento)
    .values({ panelId, numeroCuenta, categoria: 'sistema', codigo, descripcion, prioridad: 3, ocurridoEn: new Date() })
    .returning({ id: evento.id });
  await abrirAlarma({ eventoId: fila!.id, panelId, prioridad: 3, descripcion, numeroCuenta });
}

/** Supervisión de horarios: apertura tarde y falta de cierre. */
export async function revisarHorarios(): Promise<number> {
  const filas = await db
    .select({
      panelId: panel.id,
      numeroCuenta: panel.numeroCuenta,
      dias: horario.dias,
      apertura: horario.apertura,
      cierre: horario.cierre,
      toleranciaMin: horario.toleranciaMin,
      zonaHoraria: sitio.zonaHoraria,
    })
    .from(horario)
    .innerJoin(panel, eq(horario.panelId, panel.id))
    .innerJoin(sitio, eq(panel.sitioId, sitio.id))
    .where(and(eq(horario.activo, true), eq(panel.activo, true), sql`(${panel.enPruebaHasta} IS NULL OR ${panel.enPruebaHasta} < now())`));
  if (filas.length === 0) return 0;

  const porPanel = new Map<number, { numeroCuenta: string; zonaHoraria: string | null; horarios: typeof filas }>();
  for (const fila of filas) {
    const entrada =
      porPanel.get(fila.panelId) ?? { numeroCuenta: fila.numeroCuenta, zonaHoraria: fila.zonaHoraria, horarios: [] };
    entrada.horarios.push(fila);
    porPanel.set(fila.panelId, entrada);
  }

  const ahora = new Date();
  // Un aviso por día y por tipo: se mira lo abierto en las últimas 20 h
  const desdeAviso = new Date(ahora.getTime() - 20 * 3_600_000);
  // Las jornadas nocturnas necesitan los movimientos de ayer
  const desdeMovimientos = new Date(ahora.getTime() - 36 * 3_600_000);

  // En feriado el comercio no abre: no se supervisan aperturas ni cierres.
  // Cada sitio decide con su propia fecha local (un feriado empieza a
  // medianoche de Venezuela, no de UTC).
  const feriados = new Set((await db.select({ fecha: feriado.fecha }).from(feriado)).map((f) => f.fecha));

  /*
   * Solo se supervisa a quien reporta aperturas y cierres. Muchos paneles
   * tienen horario cargado pero no transmiten esos eventos (no están
   * programados para eso): reclamarles "no abrió" todos los días es ruido,
   * no supervisión. Con 30 días sin un solo movimiento, el horario se ignora.
   */
  const reportan = new Set(
    (
      await db
        .selectDistinct({ panelId: evento.panelId })
        .from(evento)
        .where(and(inArray(evento.categoria, ['apertura', 'cierre']), gte(evento.ocurridoEn, new Date(ahora.getTime() - 30 * 86_400_000))))
    ).map((f) => f.panelId),
  );

  let abiertas = 0;

  for (const [panelId, { numeroCuenta, zonaHoraria, horarios }] of porPanel) {
    if (!reportan.has(panelId)) continue;
    // Cada sitio se evalúa con su propia hora local
    const ahoraLocal = enZona(zonaHoraria, ahora);
    if (feriados.has(fechaIsoLocal(ahoraLocal))) continue;
    const movimientos = await db
      .select({ categoria: evento.categoria, ocurridoEn: evento.ocurridoEn })
      .from(evento)
      .where(
        and(
          eq(evento.panelId, panelId),
          inArray(evento.categoria, ['apertura', 'cierre']),
          gte(evento.ocurridoEn, desdeMovimientos),
        ),
      );
    // Los movimientos pasan a la misma hora local que "ahora"
    const aperturas = movimientos.filter((m) => m.categoria === 'apertura').map((m) => enZona(zonaHoraria, m.ocurridoEn));
    const cierres = movimientos.filter((m) => m.categoria === 'cierre').map((m) => enZona(zonaHoraria, m.ocurridoEn));

    const pendientes = evaluarPendientesDia(horarios, aperturas, cierres, ahoraLocal);

    if (pendientes.aperturaTarde && !(await yaAvisadoHoy(panelId, 'HOR-AT', desdeAviso))) {
      await abrirAlarmaHorario(panelId, numeroCuenta, 'HOR-AT', `Apertura tarde: cuenta ${numeroCuenta} no abrió a horario`);
      abiertas++;
    }
    if (pendientes.sinCierre && !(await yaAvisadoHoy(panelId, 'HOR-SC', desdeAviso))) {
      await abrirAlarmaHorario(panelId, numeroCuenta, 'HOR-SC', `Sin cierre: cuenta ${numeroCuenta} sigue abierta pasado el horario`);
      abiertas++;
    }
  }
  return abiertas;
}

/**
 * Puentes caídos y restablecidos. Si el programa de la PC de la central deja
 * de latir, la central deja de recibir todo un receptor sin enterarse: es de
 * las fallas más graves posibles.
 *
 * Se avisa **por episodio**, no por día: una vez cuando cae y una vez cuando
 * vuelve, con la duración del corte. Antes se repetía el aviso cada
 * medianoche mientras siguiera caído, que era ruido puro.
 */
export async function revisarPuentes(): Promise<number> {
  const puentes = await db
    .select({
      id: bridge.id,
      nombre: bridge.nombre,
      intervaloLatidoSeg: bridge.intervaloLatidoSeg,
      ultimoLatidoEn: bridge.ultimoLatidoEn,
      creadoEn: bridge.creadoEn,
      caidoDesde: bridge.caidoDesde,
    })
    .from(bridge)
    .where(and(eq(bridge.activo, true), eq(bridge.supervisado, true)));

  const ahora = Date.now();
  let avisos = 0;
  for (const p of puentes) {
    const tope = p.intervaloLatidoSeg * LATIDOS_PERDIDOS_PUENTE * 1000;
    const ultimo = p.ultimoLatidoEn ?? p.creadoEn;
    const caido = ahora - ultimo.getTime() > tope;

    if (caido && !p.caidoDesde) {
      const espera = p.intervaloLatidoSeg * LATIDOS_PERDIDOS_PUENTE;
      const descripcion = `PUENTE CAÍDO: sin latido de ${p.nombre} hace más de ${
        espera < 60 ? `${espera} s` : duracionLegible(Math.round(espera / 60))
      }`;
      const [filaEvento] = await db
        .insert(evento)
        .values({ categoria: 'sistema', codigo: 'BRIDGE', descripcion, prioridad: 2, ocurridoEn: new Date() })
        .returning({ id: evento.id });
      await abrirAlarma({ eventoId: filaEvento!.id, prioridad: 2, descripcion });
      await avisarAlPersonal(filaEvento!.id, 'BRIDGE', descripcion, 2);
      // El episodio arranca en el último latido, no ahora: así la duración es la real
      await db.update(bridge).set({ caidoDesde: ultimo }).where(eq(bridge.id, p.id));
      avisos++;
      continue;
    }

    if (!caido && p.caidoDesde) {
      const minutos = Math.max(1, Math.round((ultimo.getTime() - p.caidoDesde.getTime()) / 60_000));
      const descripcion = `PUENTE RESTABLECIDO: volvió el latido de ${p.nombre} tras ${duracionLegible(minutos)} sin reportar`;
      const [filaRestaurada] = await db
        .insert(evento)
        .values({ categoria: 'restauracion', codigo: 'BRIDGE-R', descripcion, prioridad: 3, ocurridoEn: new Date() })
        .returning({ id: evento.id });
      await avisarAlPersonal(filaRestaurada!.id, 'BRIDGE-R', descripcion, 3);
      await db.update(bridge).set({ caidoDesde: null }).where(eq(bridge.id, p.id));
      avisos++;
    }
  }
  return avisos;
}

/**
 * Publica un evento del vigilante para que la API se lo mande al personal.
 * Lleva `soloPersonal` para que NO le llegue también a los clientes: el
 * cliente no tiene nada que hacer con un puente caído de la central.
 */
async function avisarAlPersonal(eventoId: number, codigo: string, descripcion: string, prioridad: number, extra: Record<string, unknown> = {}): Promise<void> {
  await notificar(CANAL_EVENTOS, { eventoId, panelId: null, categoria: codigo === 'BRIDGE-R' ? 'restauracion' : 'sistema', codigo, descripcion, prioridad, soloPersonal: true, ...extra });
}

/** "2 h 15 min", "45 min": para que el aviso diga cuánto duró el corte. */
export function duracionLegible(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto ? `${horas} h ${resto} min` : `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} d ${horas % 24} h`;
}

/** Minutos sin recibir NADA (de ningún receptor) para dar la central por muda. */
export const SILENCIO_GENERAL_MIN = Number(process.env.SILENCIO_GENERAL_MIN ?? SILENCIO_GENERAL_MIN_POR_DEFECTO);
const CODIGO_SILENCIO_GENERAL = 'SIS-GEN';

/** ¿La última señal es demasiado vieja? Sin señales nunca, también. */
export function haySilencioGeneral(ultima: Date | null, ahora: Date, limiteMin: number = SILENCIO_GENERAL_MIN): boolean {
  return ultima === null || ahora.getTime() - ultima.getTime() > limiteMin * 60_000;
}

/**
 * Silencio general: si en 20 minutos no entró ni una trama por ningún
 * receptor (ni latidos), lo más probable es que se haya caído el enlace, el
 * puente o el propio receptor, y la central está ciega sin saberlo. Abre una
 * alarma de prioridad máxima sin cuenta; cuando vuelven las señales queda
 * marcada como restaurada con la hora, y el operador la cierra.
 */
export async function revisarSilencioGeneral(ahora: Date = new Date()): Promise<boolean> {
  const [ultimaFila] = await db.select({ recibidaEn: senal.recibidaEn }).from(senal).orderBy(desc(senal.recibidaEn)).limit(1);
  const ultima = ultimaFila?.recibidaEn ?? null;
  const [abierta] = await db
    .select({ id: alarma.id, restauradaEn: alarma.restauradaEn })
    .from(alarma)
    .innerJoin(evento, eq(alarma.eventoId, evento.id))
    .where(and(eq(evento.codigo, CODIGO_SILENCIO_GENERAL), ne(alarma.estado, 'cerrada')))
    .orderBy(desc(alarma.id))
    .limit(1);

  if (haySilencioGeneral(ultima, ahora)) {
    if (abierta) return false;
    const hora = ultima ? ultima.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: ZONA_HORARIA_CENTRAL }) : 'nunca';
    const descripcion = `SIN SEÑALES EN LA CENTRAL: ningún receptor recibió nada hace más de ${duracionLegible(SILENCIO_GENERAL_MIN)} (última ${hora})`;
    const [filaEvento] = await db
      .insert(evento)
      .values({ categoria: 'sistema', codigo: CODIGO_SILENCIO_GENERAL, descripcion, prioridad: 1, ocurridoEn: ahora })
      .returning({ id: evento.id });
    await abrirAlarma({ eventoId: filaEvento!.id, prioridad: 1, descripcion });
    await avisarAlPersonal(filaEvento!.id, CODIGO_SILENCIO_GENERAL, descripcion, 1);
    return true;
  }

  // Volvieron las señales: la alarma abierta queda restaurada, no cerrada
  if (abierta && !abierta.restauradaEn) {
    await db.update(alarma).set({ restauradaEn: ahora }).where(and(eq(alarma.id, abierta.id), isNull(alarma.restauradaEn)));
    await db.insert(accionAlarma).values({ alarmaId: abierta.id, operadorId: null, tipo: 'sistema', detalle: 'Volvieron a entrar señales a la central' });
  }
  return false;
}

/** Arranca el vigilante periódico. Devuelve una función para detenerlo. */
export function iniciarVigilante(opciones: {
  intervaloMs?: number;
  alError?: (err: unknown) => void;
}): () => void {
  const { intervaloMs = 60_000, alError } = opciones;
  let corriendo = false;
  const temporizador = setInterval(async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await revisarSilencioGeneral();
      await revisarPanelesSilenciosos();
      await revisarHorarios();
      await revisarPuentes();
    } catch (err) {
      alError?.(err);
    } finally {
      corriendo = false;
    }
  }, intervaloMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
