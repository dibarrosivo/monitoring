import type { Logger } from 'pino';
import {
  construirAck,
  construirNak,
  evaluarHora,
  parsearDatosAdmCid,
  parsearTramaDc09,
} from '@monitoring/protocols';
import { interpretarCid, type FuenteSenal } from '@monitoring/shared';
import { buscarPanelPorCuenta, procesarEvento, registrarSenal, registrarVida } from '@monitoring/engine';

/**
 * Control de hora de las tramas cifradas (ver controlHora.ts):
 * - 'observar' (por defecto): se acepta igual, pero queda anotado en la señal
 *   por qué se habría rechazado. Es para medir una semana antes de exigir.
 * - 'exigir': se rechaza con NAK, que lleva la hora del receptor para que el
 *   panel ajuste su reloj.
 * - 'apagado': no se mira.
 */
export type ModoControlHora = 'observar' | 'exigir' | 'apagado';

export function modoControlHora(valor = process.env.DC09_CONTROL_HORA): ModoControlHora {
  return valor === 'exigir' || valor === 'apagado' ? valor : 'observar';
}

/**
 * Maneja una trama DC-09 (TCP o UDP) y devuelve la respuesta a enviar.
 * Regla de oro: la trama cruda se persiste ANTES de responder ACK; si la
 * persistencia falla se responde NAK y el panel reintenta.
 */
export async function manejarTramaDc09(
  datos: Buffer,
  fuente: FuenteSenal,
  remoto: string,
  log: Logger,
  claveAes?: Buffer,
  modoHora: ModoControlHora = modoControlHora(),
): Promise<Buffer> {
  const recibidaEn = new Date();
  const cruda = datos.toString('latin1');
  const resultado = parsearTramaDc09(datos, { claveAes });

  try {
    if (!resultado.ok) {
      if (resultado.error === 'trama-cifrada' || resultado.error === 'descifrado-fallido') {
        // Se persiste y se responde NAK: el panel reintenta y queda el rastro para
        // corregir la clave AES (o el cifrado del panel) con la trama real a la vista.
        await registrarSenal({ fuente, remoto, cruda, estadoParse: 'cifrada', detalleError: resultado.detalle });
        log.warn(
          { remoto, error: resultado.error, detalle: resultado.detalle },
          resultado.error === 'trama-cifrada'
            ? 'Trama DC-09 cifrada sin clave configurada (DC09_CLAVE_AES)'
            : 'No se pudo descifrar la trama DC-09: revisar la clave AES',
        );
      } else {
        await registrarSenal({ fuente, remoto, cruda, estadoParse: 'error', detalleError: `${resultado.error}: ${resultado.detalle ?? ''}` });
        log.warn({ remoto, error: resultado.error, detalle: resultado.detalle }, 'Trama DC-09 inválida');
      }
      return construirNak();
    }

    const { trama } = resultado;

    /*
     * Control de repetición, solo para tramas cifradas: una en claro se puede
     * fabricar entera, y mirarle la hora no protege nada.
     */
    let notaHora: string | undefined;
    if (trama.cifrada && modoHora !== 'apagado') {
      const hora = evaluarHora(trama.marcaTiempo, recibidaEn);
      if (!hora.ok) {
        const detalle =
          hora.motivo === 'sin-hora'
            ? 'trama cifrada sin hora'
            : `hora fuera de ventana: ${hora.atrasoSeg > 0 ? 'atrasada' : 'adelantada'} ${Math.abs(hora.atrasoSeg)} s`;
        if (modoHora === 'exigir') {
          await registrarSenal({ fuente, remoto, cruda, estadoParse: 'error', detalleError: `${detalle}; posible repetición, rechazada` });
          log.warn({ remoto, cuenta: trama.numeroCuenta, detalle }, 'Trama DC-09 cifrada rechazada por la hora');
          // El NAK lleva la hora GMT del receptor: el panel ajusta su reloj y reintenta
          return construirNak();
        }
        notaHora = `${detalle} (en observación: se aceptó)`;
        log.warn({ remoto, cuenta: trama.numeroCuenta, detalle }, 'Trama DC-09 cifrada fuera de hora (observación)');
      }
    }

    /*
     * Cifrado obligatorio por cuenta. Una trama en claro de una cuenta que ya
     * pasó a cifrado es, o un panel que perdió su configuración, o alguien que
     * se hace pasar por él. En los dos casos no se le cree: queda en el diario
     * para investigar, y el NAK hace que un panel legítimo vuelva a intentar.
     */
    if (!trama.cifrada) {
      const dueno = await buscarPanelPorCuenta(trama.numeroCuenta, fuente);
      if (dueno?.cifradoObligatorio) {
        await registrarSenal({ fuente, remoto, cruda, estadoParse: 'error', detalleError: 'en claro, y la cuenta exige cifrado', panelId: dueno.id });
        log.warn({ remoto, cuenta: trama.numeroCuenta }, 'Trama DC-09 en claro rechazada: la cuenta exige cifrado');
        return construirNak();
      }
    }

    if (trama.id === 'NULL') {
      // Latido de supervisión: registra vida del panel, no genera evento.
      const panelEncontrado = await buscarPanelPorCuenta(trama.numeroCuenta, fuente);
      await registrarSenal({ fuente, remoto, cruda, estadoParse: 'ignorada', detalleError: notaHora ? `latido NULL; ${notaHora}` : 'latido NULL', panelId: panelEncontrado?.id });
      if (panelEncontrado) await registrarVida(panelEncontrado.id, recibidaEn);
      return construirAck(trama, trama.cifrada ? claveAes : undefined);
    }

    if (trama.id === 'ADM-CID') {
      const cid = parsearDatosAdmCid(trama.datos);
      if (!cid) {
        await registrarSenal({ fuente, remoto, cruda, estadoParse: 'error', detalleError: `datos ADM-CID no reconocidos: ${trama.datos}` });
        log.warn({ remoto, datos: trama.datos }, 'Datos ADM-CID no reconocidos');
        return construirNak();
      }
      const senalId = await registrarSenal({ fuente, remoto, cruda, estadoParse: 'ok', detalleError: notaHora });
      const normalizado = interpretarCid({
        numeroCuenta: trama.numeroCuenta,
        calificador: cid.calificador,
        codigoCid: cid.codigoCid,
        particion: cid.particion,
        zona: cid.zona,
        ocurridoEn: trama.marcaTiempo,
      });
      const res = await procesarEvento({ senalId, normalizado, recibidaEn, fuente });
      log.info(
        { remoto, cuenta: trama.numeroCuenta, codigo: normalizado.codigo, eventoId: res.eventoId, alarmaId: res.alarmaId },
        normalizado.descripcion,
      );
      return construirAck(trama, trama.cifrada ? claveAes : undefined);
    }

    // Otros identificadores (SIA-DCS, etc.): se guarda crudo y se confirma para que el
    // panel no reintente en bucle; configurar los paneles Hikvision en ADM-CID.
    await registrarSenal({ fuente, remoto, cruda, estadoParse: 'ignorada', detalleError: `id no soportado: ${trama.id}` });
    log.warn({ remoto, id: trama.id }, 'Identificador DC-09 no soportado (usar ADM-CID)');
    return construirAck(trama, trama.cifrada ? claveAes : undefined);
  } catch (err) {
    log.error({ err, remoto }, 'Error procesando trama DC-09; se responde NAK');
    return construirNak();
  }
}
