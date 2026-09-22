import net from 'node:net';
import type { Logger } from 'pino';
import { ACK_SERIE, parsearLineaSurgard, separarTramasPegadas } from '@monitoring/protocols';
import { interpretarCid } from '@monitoring/shared';
import { buscarPanelPorCuenta, procesarEvento, registrarSenal, registrarVida } from '@monitoring/engine';
import { esTraficoAjeno, registrarEscaneo } from './basura.js';

/**
 * Escucha TCP para receptores que entregan Sur-Gard MLR2 por red y esperan ACK.
 *
 * El caso concreto es el receptor EBS OSM de la central: en su configuración
 * se agrega un "analizador" apuntando a este puerto con formato CID, y él
 * conecta, manda cada evento como una línea y espera el ACK (0x06). Si no lo
 * recibe, retransmite cada 15 segundos hasta que alguien confirme. Por eso
 * este escucha SÍ responde, a diferencia del de PIMA: acá somos el destino
 * final de esta conexión, no un oyente de paso.
 *
 * Cada 10 segundos manda un latido ("1011 @"); también se confirma, pero no
 * se guarda cada uno: serían miles de filas por día sin información. Se deja
 * rastro de uno cada tanto para saber que el receptor está vivo.
 */

const SEPARADORES = /[\r\n\x14]+/;
const MAX_RESTO = 4096;
const ENTRE_LATIDOS_GUARDADOS_MS = 5 * 60_000;

/**
 * Corta el flujo en tramas. Además del terminador, separa las que llegaron
 * pegadas: el receptor retransmite lo no confirmado y a veces las junta.
 * Devuelve las tramas completas y lo que queda por completar.
 */
export function trocearSurgard(resto: string, datos: string): { tramas: string[]; resto: string } {
  const junto = resto + datos;
  const partes = junto.split(SEPARADORES);
  let pendiente = partes.pop() ?? '';
  if (pendiente.length > MAX_RESTO) pendiente = '';
  const tramas: string[] = [];
  for (const parte of partes) {
    if (!parte.trim()) continue;
    tramas.push(...separarTramasPegadas(parte));
  }
  return { tramas, resto: pendiente };
}

export function iniciarSurgardTcp(puerto: string | number, log: Logger): net.Server {
  const servidor = net.createServer((socket) => {
    const remoto = `${socket.remoteAddress}:${socket.remotePort}`;
    log.info({ remoto }, 'Receptor Sur-Gard conectado');
    let resto = '';
    let ultimoLatidoGuardado = 0;
    let primerTrozo = true;

    socket.on('data', (datos) => {
      if (primerTrozo) {
        primerTrozo = false;
        const motivo = esTraficoAjeno(datos);
        if (motivo) {
          void registrarEscaneo({ fuente: 'surgard-tcp', remoto, motivo, datos, log });
          socket.destroy();
          return;
        }
      }
      const troceado = trocearSurgard(resto, datos.toString('latin1'));
      resto = troceado.resto;
      for (const trama of troceado.tramas) {
        // El ACK sale apenas se tiene la trama entera; el receptor no espera al proceso
        socket.write(Buffer.from([ACK_SERIE]));
        const esLatido = parsearLineaSurgard(trama).tipo === 'latido';
        if (esLatido && Date.now() - ultimoLatidoGuardado < ENTRE_LATIDOS_GUARDADOS_MS) {
          log.debug({ remoto }, 'Latido del receptor Sur-Gard');
          continue;
        }
        if (esLatido) ultimoLatidoGuardado = Date.now();
        void procesarTrama(trama, remoto, log);
      }
    });

    socket.on('error', (err) => log.warn({ remoto, err: err.message }, 'Error del socket del receptor Sur-Gard'));
    socket.on('close', () => log.warn({ remoto }, 'Receptor Sur-Gard desconectado'));
  });

  servidor.listen(Number(puerto), () => log.info({ puerto: Number(puerto) }, 'Escuchando Sur-Gard MLR2 por TCP'));
  return servidor;
}

/** Regla de oro: la trama cruda se persiste SIEMPRE, se entienda o no. */
async function procesarTrama(trama: string, remoto: string, log: Logger): Promise<void> {
  const recibidaEn = new Date();
  try {
    const surgard = parsearLineaSurgard(trama);

    if (surgard.tipo === 'cid') {
      const panel = await buscarPanelPorCuenta(surgard.numeroCuenta, 'surgard-tcp');
      const senalId = await registrarSenal({
        fuente: 'surgard-tcp',
        remoto,
        cruda: trama,
        estadoParse: 'ok',
        panelId: panel?.id,
      });
      const resultado = await procesarEvento({
        senalId,
        normalizado: interpretarCid({
          numeroCuenta: surgard.numeroCuenta,
          calificador: surgard.calificador,
          codigoCid: surgard.codigoCid,
          particion: surgard.particion,
          zona: surgard.zona,
        }),
        recibidaEn,
        fuente: 'surgard-tcp',
      });
      if (panel) await registrarVida(panel.id, recibidaEn);
      log.info(
        { remoto, cuenta: surgard.numeroCuenta, codigo: surgard.codigoCid, eventoId: resultado.eventoId, alarmaId: resultado.alarmaId },
        'Señal Sur-Gard procesada',
      );
      return;
    }

    if (surgard.tipo === 'latido') {
      await registrarSenal({
        fuente: 'surgard-tcp',
        remoto,
        cruda: trama,
        estadoParse: 'ignorada',
        detalleError: 'latido del receptor',
      });
      return;
    }

    await registrarSenal({
      fuente: 'surgard-tcp',
      remoto,
      cruda: trama,
      estadoParse: 'error',
      detalleError: 'línea no reconocida',
    });
    log.warn({ remoto, cruda: trama }, 'Línea Sur-Gard no reconocida');
  } catch (err) {
    // Que una trama falle no puede tumbar el escucha: las siguientes deben seguir entrando
    log.error({ remoto, err }, 'Error al procesar una trama Sur-Gard');
  }
}
