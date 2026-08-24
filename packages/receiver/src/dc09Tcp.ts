import net from 'node:net';
import type { Logger } from 'pino';
import { manejarTramaDc09 } from './dc09Manejador.js';

const TIMEOUT_SOCKET_MS = 5 * 60_000;

/** Servidor TCP para SIA DC-09. Las tramas terminan en CR; puede haber varias por conexión. */
export function iniciarDc09Tcp(puerto: string | number, log: Logger): net.Server {
  const servidor = net.createServer((socket) => {
    const remoto = `${socket.remoteAddress}:${socket.remotePort}`;
    log.debug({ remoto }, 'Conexión DC-09 TCP');
    socket.setTimeout(TIMEOUT_SOCKET_MS, () => socket.destroy());

    let resto = Buffer.alloc(0);
    // Las tramas de una misma conexión se procesan en orden.
    let cola: Promise<void> = Promise.resolve();

    socket.on('data', (datos) => {
      resto = Buffer.concat([resto, datos]);
      let indice: number;
      while ((indice = resto.indexOf(0x0d)) !== -1) {
        const trama = resto.subarray(0, indice + 1);
        resto = resto.subarray(indice + 1);
        cola = cola.then(async () => {
          const respuesta = await manejarTramaDc09(trama, 'dc09-tcp', remoto, log);
          if (!socket.destroyed) socket.write(respuesta);
        });
      }
      // Protección contra basura sin CR
      if (resto.length > 4096) {
        log.warn({ remoto }, 'Buffer TCP excedido sin CR; se descarta y cierra');
        socket.destroy();
      }
    });

    socket.on('error', (err) => log.debug({ remoto, err: err.message }, 'Error de socket DC-09'));
  });

  servidor.listen(Number(puerto), () => log.info({ puerto: Number(puerto) }, 'Escuchando SIA DC-09 por TCP'));
  return servidor;
}
