import { registrar } from './registro.js';
import type { Config } from './config.js';
import type { ColaEnDisco } from './cola.js';

/**
 * Envío al servidor con reintentos y espera creciente. Las tramas solo salen de
 * la cola cuando el servidor confirma haberlas recibido, así una caída de red
 * o del servidor no pierde nada: se acumulan y se mandan al volver.
 */

const LOTE = 50;
const ESPERA_INICIAL_MS = 2000;
const ESPERA_MAXIMA_MS = 60_000;

export class Enviador {
  private enviando = false;
  private espera = ESPERA_INICIAL_MS;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  /** Total de tramas reenviadas desde que arrancó el puente */
  public tramasEnviadas = 0;

  constructor(
    private readonly config: Config,
    private readonly cola: ColaEnDisco,
  ) {}

  /** Pide un intento de vaciado; si ya hay uno en curso, no hace nada. */
  despertar(): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    void this.vaciar();
  }

  private programarReintento(): void {
    if (this.temporizador) return;
    registrar('warn', 'Reintentando el envío más tarde', {
      enSegundos: Math.round(this.espera / 1000),
      pendientes: this.cola.cantidad,
    });
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.vaciar();
    }, this.espera);
    this.espera = Math.min(this.espera * 2, ESPERA_MAXIMA_MS);
  }

  private async vaciar(): Promise<void> {
    if (this.enviando || this.cola.cantidad === 0) return;
    this.enviando = true;
    try {
      while (this.cola.cantidad > 0) {
        const lote = this.cola.proximas(LOTE);
        const respuesta = await fetch(`${this.config.servidor}/api/bridge/senales`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.token}` },
          body: JSON.stringify({
            bridge: this.config.nombre,
            fuente: this.config.fuente,
            version: VERSION,
            tramas: lote,
          }),
        });

        if (!respuesta.ok) {
          registrar('error', 'El servidor rechazó el lote', {
            estado: respuesta.status,
            detalle: (await respuesta.text()).slice(0, 200),
          });
          this.programarReintento();
          return;
        }

        this.cola.confirmar(lote.length);
        this.tramasEnviadas += lote.length;
        this.espera = ESPERA_INICIAL_MS;
        registrar('info', 'Lote entregado', { tramas: lote.length, pendientes: this.cola.cantidad });
      }
    } catch (err) {
      registrar('warn', 'No se pudo contactar al servidor', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.programarReintento();
    } finally {
      this.enviando = false;
    }
  }

  /** Latido periódico: sin esto, la central da el puente por caído. */
  async latir(): Promise<void> {
    try {
      await fetch(`${this.config.servidor}/api/bridge/latido`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.token}` },
        body: JSON.stringify({
          bridge: this.config.nombre,
          fuente: this.config.fuente,
          version: VERSION,
          tramasRecibidas: this.tramasEnviadas,
        }),
      });
    } catch (err) {
      registrar('debug', 'Latido no entregado', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export const VERSION = '0.1.0';
