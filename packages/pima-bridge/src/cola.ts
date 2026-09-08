import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/**
 * Cola en disco: cada trama se escribe ANTES de intentar enviarla, así un corte
 * de red, un cierre de sesión de Windows o un apagón no pierden señales. El
 * archivo es JSONL (una trama por línea) para poder recuperarlo a mano si hace
 * falta.
 */

export interface TramaPendiente {
  cruda: string;
  leidaEn: string;
}

export class ColaEnDisco {
  private pendientes: TramaPendiente[] = [];

  constructor(private readonly archivo: string) {
    if (existsSync(archivo)) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const linea of contenido.split('\n')) {
        if (!linea.trim()) continue;
        try {
          this.pendientes.push(JSON.parse(linea) as TramaPendiente);
        } catch {
          // línea corrupta (corte a mitad de escritura): se descarta esa sola
        }
      }
    }
  }

  get cantidad(): number {
    return this.pendientes.length;
  }

  /** Escribe la trama en disco y recién ahí la da por aceptada. */
  agregar(trama: TramaPendiente): void {
    appendFileSync(this.archivo, JSON.stringify(trama) + '\n');
    this.pendientes.push(trama);
  }

  /** Primeras N tramas, sin sacarlas: se quitan solo cuando el servidor confirma. */
  proximas(cantidad: number): TramaPendiente[] {
    return this.pendientes.slice(0, cantidad);
  }

  /** Confirma el envío de las primeras N y reescribe el archivo. */
  confirmar(cantidad: number): void {
    this.pendientes = this.pendientes.slice(cantidad);
    const temporal = `${this.archivo}.tmp`;
    writeFileSync(temporal, this.pendientes.map((t) => JSON.stringify(t)).join('\n') + (this.pendientes.length ? '\n' : ''));
    renameSync(temporal, this.archivo);
  }
}
