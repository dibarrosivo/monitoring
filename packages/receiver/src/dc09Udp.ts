import dgram from 'node:dgram';
import type { Logger } from 'pino';
import { manejarTramaDc09 } from './dc09Manejador.js';

/** Servidor UDP para SIA DC-09: un datagrama = una trama. */
export function iniciarDc09Udp(puerto: string | number, log: Logger): dgram.Socket {
  const socket = dgram.createSocket('udp4');

  socket.on('message', async (datos, rinfo) => {
    const remoto = `${rinfo.address}:${rinfo.port}`;
    const respuesta = await manejarTramaDc09(datos, 'dc09-udp', remoto, log);
    socket.send(respuesta, rinfo.port, rinfo.address);
  });

  socket.on('error', (err) => log.error({ err }, 'Error del socket UDP DC-09'));
  socket.bind(Number(puerto), () => log.info({ puerto: Number(puerto) }, 'Escuchando SIA DC-09 por UDP'));
  return socket;
}
