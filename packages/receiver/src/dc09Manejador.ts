import type { Logger } from 'pino';
import {
  construirAck,
  construirNak,
  parsearDatosAdmCid,
  parsearTramaDc09,
} from '@monitoring/protocols';
import { interpretarCid, type FuenteSenal } from '@monitoring/shared';
import { buscarPanelPorCuenta, procesarEvento, registrarSenal, registrarVida } from '@monitoring/engine';

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

    if (trama.id === 'NULL') {
      // Latido de supervisión: registra vida del panel, no genera evento.
      const panelEncontrado = await buscarPanelPorCuenta(trama.numeroCuenta);
      await registrarSenal({ fuente, remoto, cruda, estadoParse: 'ignorada', detalleError: 'latido NULL', panelId: panelEncontrado?.id });
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
      const senalId = await registrarSenal({ fuente, remoto, cruda, estadoParse: 'ok' });
      const normalizado = interpretarCid({
        numeroCuenta: trama.numeroCuenta,
        calificador: cid.calificador,
        codigoCid: cid.codigoCid,
        particion: cid.particion,
        zona: cid.zona,
        ocurridoEn: trama.marcaTiempo,
      });
      const res = await procesarEvento({ senalId, normalizado, recibidaEn });
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
