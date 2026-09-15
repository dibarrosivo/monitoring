import net from 'node:net';
import type { Logger } from 'pino';
import { parsearLineaPima, parsearLineaSurgard } from '@monitoring/protocols';
import { interpretarCid, interpretarPima } from '@monitoring/shared';
import { buscarPanelPorCuenta, procesarEvento, registrarSenal, registrarVida } from '@monitoring/engine';

/**
 * Escucha TCP para el formato del receptor PIMA.
 *
 * El programa que corre en la PC de la central (`shareport`) lee el puerto
 * serie del receptor y reenvía las tramas por TCP crudo. Puede entregar la
 * misma entrada a varios destinos, así que nos suscribimos como uno más sin
 * interrumpir al sistema en producción.
 *
 * NO respondemos nada por este socket. El ACK al receptor lo sigue emitiendo
 * quien lo viene haciendo, y dos programas respondiendo confundirían al
 * receptor. Nuestro extremo solo lee.
 *
 * Las tramas llegan en el formato de dos caracteres verificado contra la
 * central, terminadas en DC4. El corte también admite CR y LF porque el
 * emisor los usa como terminadores alternativos.
 */

const SEPARADORES = /[\r\n\x14]+/;
/** Un flujo sin separadores no puede crecer sin límite */
const MAX_RESTO = 4096;

export function iniciarPimaTcp(puerto: string | number, log: Logger): net.Server {
  const servidor = net.createServer((socket) => {
    const remoto = `${socket.remoteAddress}:${socket.remotePort}`;
    log.info({ remoto }, 'Puente PIMA conectado');
    let resto = '';

    socket.on('data', (datos) => {
      resto += datos.toString('latin1');
      const partes = resto.split(SEPARADORES);
      resto = partes.pop() ?? '';
      if (resto.length > MAX_RESTO) resto = '';
      for (const linea of partes) {
        if (linea.trim()) void procesarLinea(linea, remoto, log);
      }
    });

    socket.on('error', (err) => log.warn({ remoto, err: err.message }, 'Error del socket del puente PIMA'));
    socket.on('close', () => log.warn({ remoto }, 'Puente PIMA desconectado'));
  });

  servidor.listen(Number(puerto), () => log.info({ puerto: Number(puerto) }, 'Escuchando receptor PIMA por TCP'));
  return servidor;
}

/** Regla de oro: la trama cruda se persiste SIEMPRE, se entienda o no. */
async function procesarLinea(linea: string, remoto: string, log: Logger): Promise<void> {
  const recibidaEn = new Date();
  try {
    const pima = parsearLineaPima(linea);
    if (pima) {
      const panel = await buscarPanelPorCuenta(pima.numeroCuenta, 'pima-bridge');
      const senalId = await registrarSenal({
        fuente: 'pima-bridge',
        remoto,
        cruda: linea,
        estadoParse: 'ok',
        panelId: panel?.id,
      });
      const resultado = await procesarEvento({
        senalId,
        normalizado: interpretarPima({ numeroCuenta: pima.numeroCuenta, codigo: pima.codigo }),
        recibidaEn,
        fuente: 'pima-bridge',
      });
      if (panel) await registrarVida(panel.id, recibidaEn);
      log.info(
        { remoto, cuenta: pima.numeroCuenta, codigo: pima.codigo, eventoId: resultado.eventoId, alarmaId: resultado.alarmaId },
        'Señal PIMA procesada',
      );
      return;
    }

    // Respaldo: un receptor de otra marca podría entregar Sur-Gard clásico
    const surgard = parsearLineaSurgard(linea);
    if (surgard.tipo === 'cid') {
      const panel = await buscarPanelPorCuenta(surgard.numeroCuenta, 'pima-bridge');
      const senalId = await registrarSenal({
        fuente: 'pima-bridge',
        remoto,
        cruda: linea,
        estadoParse: 'ok',
        panelId: panel?.id,
      });
      await procesarEvento({
        senalId,
        normalizado: interpretarCid({
          numeroCuenta: surgard.numeroCuenta,
          calificador: surgard.calificador,
          codigoCid: surgard.codigoCid,
          particion: surgard.particion,
          zona: surgard.zona,
        }),
        recibidaEn,
        fuente: 'pima-bridge',
      });
      if (panel) await registrarVida(panel.id, recibidaEn);
      return;
    }

    if (surgard.tipo === 'latido') {
      await registrarSenal({
        fuente: 'pima-bridge',
        remoto,
        cruda: linea,
        estadoParse: 'ignorada',
        detalleError: 'latido del receptor',
      });
      return;
    }

    await registrarSenal({
      fuente: 'pima-bridge',
      remoto,
      cruda: linea,
      estadoParse: 'error',
      detalleError: 'línea no reconocida',
    });
    log.warn({ remoto, cruda: linea }, 'Línea del receptor PIMA no reconocida');
  } catch (err) {
    // Que una trama falle no puede tumbar el escucha: las siguientes deben seguir entrando
    log.error({ remoto, err }, 'Error al procesar una línea del receptor PIMA');
  }
}
