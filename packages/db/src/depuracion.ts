import { sql } from 'drizzle-orm';
import { db } from './index.js';

/**
 * Depuración del diario crudo de señales.
 *
 * `senal` guarda cada trama tal como llegó y crece sin parar (los latidos de
 * supervisión solos ya son miles por día). Los eventos y las alarmas — el
 * registro operativo y legal — no se tocan nunca: al borrar una señal, su
 * evento queda con `id_senal` en NULL y conserva todo lo decodificado.
 *
 * El borrado va por lotes para no bloquear la tabla mientras el receptor
 * sigue insertando.
 */

export interface ResultadoDepuracion {
  eliminadas: number;
  diasRetencion: number;
}

const LOTE = 5000;

export async function depurarSenales(diasRetencion: number): Promise<ResultadoDepuracion> {
  if (!Number.isFinite(diasRetencion) || diasRetencion < 1) {
    throw new Error(`Retención inválida: ${diasRetencion} (mínimo 1 día)`);
  }

  let eliminadas = 0;
  for (;;) {
    const resultado = await db.execute(sql`
      DELETE FROM senal
      WHERE id IN (
        SELECT id FROM senal
        WHERE recibida_en < now() - (${diasRetencion} * interval '1 day')
        ORDER BY id
        LIMIT ${LOTE}
      )
    `);
    const borradas = resultado.rowCount ?? 0;
    eliminadas += borradas;
    if (borradas < LOTE) break;
  }

  return { eliminadas, diasRetencion };
}

/**
 * Arranca la depuración periódica (una vez por día). Sin días configurados no
 * hace nada: la retención es una decisión explícita de cada central.
 */
export function iniciarDepuracionPeriodica(opciones: {
  diasRetencion?: number;
  alDepurar?: (resultado: ResultadoDepuracion) => void;
  alError?: (err: unknown) => void;
}): () => void {
  const { diasRetencion, alDepurar, alError } = opciones;
  if (!diasRetencion) return () => {};

  let corriendo = false;
  const ejecutar = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      const resultado = await depurarSenales(diasRetencion);
      if (resultado.eliminadas > 0) alDepurar?.(resultado);
    } catch (err) {
      alError?.(err);
    } finally {
      corriendo = false;
    }
  };

  const temporizador = setInterval(() => void ejecutar(), 24 * 60 * 60_000);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
