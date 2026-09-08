/** Registro mínimo a consola y archivo diario (sin dependencias). */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const NIVELES = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Nivel = keyof typeof NIVELES;

let nivelMinimo: Nivel = 'info';
let carpetaLogs = 'logs';

export function configurarRegistro(nivel: Nivel, carpeta = 'logs'): void {
  nivelMinimo = nivel;
  carpetaLogs = carpeta;
  try {
    mkdirSync(carpetaLogs, { recursive: true });
  } catch {
    // sin permisos de escritura: solo consola
  }
}

export function registrar(nivel: Nivel, mensaje: string, datos?: Record<string, unknown>): void {
  if (NIVELES[nivel] < NIVELES[nivelMinimo]) return;
  const fecha = new Date();
  const linea = `${fecha.toISOString()} [${nivel.toUpperCase()}] ${mensaje}${datos ? ' ' + JSON.stringify(datos) : ''}`;
  console.log(linea);
  try {
    const archivo = join(carpetaLogs, `puente-${fecha.toISOString().slice(0, 10)}.log`);
    mkdirSync(dirname(archivo), { recursive: true });
    appendFileSync(archivo, linea + '\n');
  } catch {
    // el registro en archivo es best-effort; nunca debe frenar al puente
  }
}
