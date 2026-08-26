import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, evento, horario, panel } from '@monitoring/db';
import { abrirAlarma, tieneAlarmaSistemaAbierta } from './procesador.js';
import { evaluarPendientesDia } from './horarios.js';

/**
 * Vigilante de paneles silenciosos: en este rubro el silencio es en sí una emergencia
 * (panel muerto, línea cortada, sabotaje). Si un panel supervisado no envía señales
 * en 1.5 veces su intervalo de prueba, se abre una alarma de sistema.
 */

const FACTOR_TOLERANCIA = 1.5;

export async function revisarPanelesSilenciosos(): Promise<number> {
  const silenciosos = await db
    .select({ id: panel.id, numeroCuenta: panel.numeroCuenta, intervaloPruebaMin: panel.intervaloPruebaMin })
    .from(panel)
    .where(
      and(
        eq(panel.activo, true),
        eq(panel.supervisado, true),
        // 1.5 × intervalo en minutos = intervalo × 90 segundos (el factor no puede ir
        // como parámetro: Postgres lo infiere entero y rechaza "1.5")
        sql`COALESCE(${panel.ultimaSenalEn}, ${panel.creadoEn}) < now() - (${panel.intervaloPruebaMin} * interval '90 seconds')`,
      ),
    );

  let abiertas = 0;
  for (const p of silenciosos) {
    if (await tieneAlarmaSistemaAbierta(p.id)) continue;

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
    })
    .from(horario)
    .innerJoin(panel, eq(horario.panelId, panel.id))
    .where(and(eq(horario.activo, true), eq(panel.activo, true)));
  if (filas.length === 0) return 0;

  const porPanel = new Map<number, { numeroCuenta: string; horarios: typeof filas }>();
  for (const fila of filas) {
    const entrada = porPanel.get(fila.panelId) ?? { numeroCuenta: fila.numeroCuenta, horarios: [] };
    entrada.horarios.push(fila);
    porPanel.set(fila.panelId, entrada);
  }

  const ahora = new Date();
  const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  let abiertas = 0;

  for (const [panelId, { numeroCuenta, horarios }] of porPanel) {
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

    const pendientes = evaluarPendientesDia(horarios, aperturas, cierres, ahora);

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
    } catch (err) {
      alError?.(err);
    } finally {
      corriendo = false;
    }
  }, intervaloMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
