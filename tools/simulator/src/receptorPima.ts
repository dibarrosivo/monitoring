/**
 * Receptor PIMA simulado: hace de receptor de central para probar el puente
 * sin hardware. Levanta un servidor TCP, emite líneas Sur-Gard y espera el
 * ACK (0x06) del puente, igual que haría el equipo real por el puerto serie.
 *
 * Uso:
 *   npm run simulador:pima                 (queda esperando y manda un latido cada 30 s)
 *   npm run simulador:pima -- --evento robo --cuenta 7002
 */
import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    puerto: { type: 'string', default: '10001' },
    cuenta: { type: 'string', default: '7002' },
    zona: { type: 'string', default: '015' },
    evento: { type: 'string' },
    intervalo: { type: 'string', default: '30' },
  },
});

const CODIGOS: Record<string, { calificador: 1 | 3; codigo: string }> = {
  robo: { calificador: 1, codigo: '130' },
  fuego: { calificador: 1, codigo: '110' },
  panico: { calificador: 1, codigo: '120' },
  prueba: { calificador: 1, codigo: '602' },
  apertura: { calificador: 1, codigo: '401' },
  cierre: { calificador: 3, codigo: '401' },
  averia: { calificador: 1, codigo: '301' },
};

const DC4 = '\x14';

/** Línea Sur-Gard MLR2: S RR L AAAA 18 Q EEE GG ZZZ */
function lineaCid(cuenta: string, calificador: number, codigo: string, zona: string, particion = '01'): string {
  return `5011${cuenta}18${calificador}${codigo}${particion}${zona}${DC4}`;
}

function lineaLatido(): string {
  return `1011           @    ${DC4}`;
}

const puerto = Number(values.puerto);
const clientes = new Set<net.Socket>();

const servidor = net.createServer((socket) => {
  const remoto = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`Puente conectado: ${remoto}`);
  clientes.add(socket);

  socket.on('data', (datos) => {
    for (const byte of datos) {
      if (byte === 0x06) console.log('  ← ACK del puente');
    }
  });
  socket.on('close', () => {
    clientes.delete(socket);
    console.log(`Puente desconectado: ${remoto}`);
  });
  socket.on('error', () => clientes.delete(socket));

  // Un evento puntual si se pidió, apenas se conecta el puente
  if (values.evento) {
    const def = CODIGOS[values.evento];
    if (!def) {
      console.error(`Evento desconocido: ${values.evento}. Opciones: ${Object.keys(CODIGOS).join(', ')}`);
      process.exit(1);
    }
    const linea = lineaCid(values.cuenta!, def.calificador, def.codigo, values.zona!);
    setTimeout(() => {
      socket.write(linea);
      console.log(`  → ${values.evento} cuenta ${values.cuenta}: ${JSON.stringify(linea)}`);
    }, 300);
  }
});

servidor.listen(puerto, () => {
  console.log(`Receptor PIMA simulado escuchando en TCP :${puerto}`);
  console.log('Configure el puente con BRIDGE_FUENTE=tcp y BRIDGE_TCP_PUERTO=' + puerto);
});

// Latido periódico del receptor, como el equipo real
const intervalo = Number(values.intervalo) * 1000;
setInterval(() => {
  for (const socket of clientes) socket.write(lineaLatido());
  if (clientes.size > 0) console.log('  → latido');
}, intervalo);
