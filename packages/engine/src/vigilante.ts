import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { bridge, db, evento, feriado, horario, panel, sitio } from '@monitoring/db';
import { abrirAlarma, tieneAlarmaSistemaAbierta } from './procesador.js';
import { ahoraEnZona, evaluarPendientesDia } from './horarios.js';

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

    const descripcion = `Panel silencioso: cuenta ${p.numeroCuenta} sin señales por más de ${Math.round(
      p.intervaloPruebaMin * FACTOR_TOLERANCIA,
    )} minutos`;

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
  const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  // En feriado el comercio no abre: no se supervisan aperturas ni cierres
  const hoyIso = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  const feriados = await db.select({ fecha: feriado.fecha }).from(feriado).where(eq(feriado.fecha, hoyIso)).limit(1);
  if (feriados.length > 0) return 0;

  let abiertas = 0;

  for (const [panelId, { numeroCuenta, zonaHoraria, horarios }] of porPanel) {
    // Cada sitio se evalúa con su propia hora local
    const ahoraLocal = ahoraEnZona(zonaHoraria, ahora);
    const movimientos = await db
      .select({ categoria: evento.categoria, ocurridoEn: evento.ocurridoEn })
      .from(evento)
      .where(
        and(
          eq(evento.panelId, panelId),
          inArray(evento.categoria, ['apertura', 'cierre']),
          gte(evento.ocurridoEn, inicioDia),
        ),
      );
    const aperturas = movimientos.filter((m) => m.categoria === 'apertura').map((m) => m.ocurridoEn);
    const cierres = movimientos.filter((m) => m.categoria === 'cierre').map((m) => m.ocurridoEn);

    const pendientes = evaluarPendientesDia(horarios, aperturas, cierres, ahoraLocal);

    if (pendientes.aperturaTarde && !(await yaAvisadoHoy(panelId, 'HOR-AT', inicioDia))) {
      await abrirAlarmaHorario(panelId, numeroCuenta, 'HOR-AT', `Apertura tarde: cuenta ${numeroCuenta} no abrió a horario`);
      abiertas++;
    }
    if (pendientes.sinCierre && !(await yaAvisadoHoy(panelId, 'HOR-SC', inicioDia))) {
      await abrirAlarmaHorario(panelId, numeroCuenta, 'HOR-SC', `Sin cierre: cuenta ${numeroCuenta} sigue abierta pasado el horario`);
      abiertas++;
    }
  }
  return abiertas;
}

/**
 * Puentes caídos: si el programa de la PC de la central deja de latir, la
 * central deja de recibir todo un receptor sin enterarse. Es de las fallas
 * más graves posibles, así que abre alarma de prioridad 2.
 */
export async function revisarPuentes(): Promise<number> {
  const silenciosos = await db
    .select({ id: bridge.id, nombre: bridge.nombre, intervaloLatidoSeg: bridge.intervaloLatidoSeg })
    .from(bridge)
    .where(
      and(
        eq(bridge.activo, true),
        eq(bridge.supervisado, true),
        sql`COALESCE(${bridge.ultimoLatidoEn}, ${bridge.creadoEn}) < now() - (${bridge.intervaloLatidoSeg} * 3 * interval '1 second')`,
      ),
    );

  let abiertas = 0;
  for (const p of silenciosos) {
    const descripcion = `PUENTE CAÍDO: ${p.nombre} no reporta hace más de ${p.intervaloLatidoSeg * 3} segundos`;
    // Un aviso por puente y por día: el operador ya lo tiene en la cola
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const [yaAvisado] = await db
      .select({ id: evento.id })
      .from(evento)
      .where(and(eq(evento.codigo, 'BRIDGE'), eq(evento.descripcion, descripcion), gte(evento.ocurridoEn, inicioDia)))
      .limit(1);
    if (yaAvisado) continue;

    const [filaEvento] = await db
      .insert(evento)
      .values({ categoria: 'sistema', codigo: 'BRIDGE', descripcion, prioridad: 2, ocurridoEn: new Date() })
      .returning({ id: evento.id });
    await abrirAlarma({ eventoId: filaEvento!.id, prioridad: 2, descripcion });
    abiertas++;
  }
  return abiertas;
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
