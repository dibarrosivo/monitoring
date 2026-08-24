import { and, eq, sql } from 'drizzle-orm';
import { db, evento, panel } from '@monitoring/db';
import { abrirAlarma, tieneAlarmaSistemaAbierta } from './procesador.js';

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
        sql`COALESCE(${panel.ultimaSenalEn}, ${panel.creadoEn}) < now() - (${panel.intervaloPruebaMin} * ${FACTOR_TOLERANCIA} * interval '1 minute')`,
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
    } catch (err) {
      alError?.(err);
    } finally {
      corriendo = false;
    }
  }, intervaloMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
