/**
 * Depuración manual del diario crudo:
 *   npm run db:depurar -- 365
 * o con RETENCION_SENALES_DIAS en el entorno. Pensado para cron en el VPS.
 */
import { depurarSenales } from './depuracion.js';
import { pool } from './index.js';

const argumento = process.argv[2];
const dias = Number(argumento ?? process.env.RETENCION_SENALES_DIAS ?? 365);

try {
  const resultado = await depurarSenales(dias);
  console.log(`Señales eliminadas: ${resultado.eliminadas} (retención de ${resultado.diasRetencion} días)`);
} catch (err) {
  console.error('Error al depurar:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
