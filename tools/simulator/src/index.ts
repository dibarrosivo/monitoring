/**
 * Simulador de paneles: envía tramas SIA DC-09 (ADM-CID) reales al receptor,
 * igual que lo haría un Hikvision AX Pro o una tarjeta EBM. Permite probar
 * todo el sistema sin hardware.
 *
 * Uso:
 *   npm run simulador -- robo --cuenta 1234 --zona 015
 *   npm run simulador -- escenario
 *   npm run simulador -- latido --udp
 *
 * Comandos: robo, fuego, panico, medica, prueba, apertura, cierre,
 *           restauracion, averia-red, latido, desconocida, escenario
 */
import net from 'node:net';
import dgram from 'node:dgram';
import { parseArgs } from 'node:util';
import { construirTramaAdmCid, construirTramaNull, parsearTramaDc09 } from '@monitoring/protocols';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    puerto: { type: 'string', default: process.env.PUERTO_DC09_TCP ?? '9999' },
    cuenta: { type: 'string', default: '1234' },
    zona: { type: 'string', default: '015' },
    particion: { type: 'string', default: '01' },
    udp: { type: 'boolean', default: false },
  },
});

const comando = positionals[0] ?? 'escenario';
const host = values.host!;
const puerto = Number(values.puerto);
const cuenta = values.cuenta!;
const zona = values.zona!;
const particion = values.particion!;

let secuencia = 0;
function proximaSecuencia(): string {
  secuencia = (secuencia % 9999) + 1;
  return String(secuencia).padStart(4, '0');
}

const CODIGOS: Record<string, { calificador: 1 | 3; codigoCid: string }> = {
  robo: { calificador: 1, codigoCid: '130' },
  fuego: { calificador: 1, codigoCid: '110' },
  panico: { calificador: 1, codigoCid: '120' },
  medica: { calificador: 1, codigoCid: '100' },
  prueba: { calificador: 1, codigoCid: '602' },
  apertura: { calificador: 1, codigoCid: '401' },
  cierre: { calificador: 3, codigoCid: '401' },
  restauracion: { calificador: 3, codigoCid: '130' },
  'averia-red': { calificador: 1, codigoCid: '301' },
};

function enviarTcp(trama: Buffer): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const socket = net.createConnection({ host, port: puerto }, () => socket.write(trama));
    socket.setTimeout(5000, () => {
      socket.destroy();
      rechazar(new Error('Sin respuesta del receptor (timeout)'));
    });
    socket.once('data', (datos) => {
      socket.end();
      resolver(datos);
    });
    socket.once('error', rechazar);
  });
}

function enviarUdp(trama: Buffer): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const socket = dgram.createSocket('udp4');
    const temporizador = setTimeout(() => {
      socket.close();
      rechazar(new Error('Sin respuesta del receptor (timeout)'));
    }, 5000);
    socket.once('message', (datos) => {
      clearTimeout(temporizador);
      socket.close();
      resolver(datos);
    });
    socket.send(trama, puerto, host, (err) => err && rechazar(err));
  });
}

async function enviar(trama: Buffer, etiqueta: string) {
  const respuesta = await (values.udp ? enviarUdp(trama) : enviarTcp(trama));
  const parseada = parsearTramaDc09(respuesta);
  const id = parseada.ok ? parseada.trama.id : `ilegible (${parseada.error})`;
  console.log(`→ ${etiqueta}\n← Respuesta: ${id}`);
  if (parseada.ok && parseada.trama.id === 'NAK') {
    console.warn('  El receptor rechazó la trama (NAK)');
  }
}

function tramaDe(nombre: string, cuentaTrama: string): Buffer {
  const def = CODIGOS[nombre];
  if (!def) throw new Error(`Comando desconocido: ${nombre}`);
  return construirTramaAdmCid({
    cuenta: cuentaTrama,
    calificador: def.calificador,
    codigoCid: def.codigoCid,
    particion,
    zona,
    secuencia: proximaSecuencia(),
    marcaTiempo: new Date(),
  });
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (comando === 'latido') {
  await enviar(construirTramaNull({ cuenta, secuencia: proximaSecuencia() }), `latido NULL cuenta ${cuenta}`);
} else if (comando === 'desconocida') {
  await enviar(tramaDe('robo', '9999'), 'robo con cuenta desconocida 9999');
} else if (comando === 'escenario') {
  console.log(`Escenario completo contra ${host}:${puerto} (cuenta ${cuenta})\n`);
  await enviar(construirTramaNull({ cuenta, secuencia: proximaSecuencia() }), 'latido NULL');
  await pausa(300);
  await enviar(tramaDe('prueba', cuenta), 'prueba periódica E602');
  await pausa(300);
  await enviar(tramaDe('apertura', cuenta), 'apertura E401');
  await pausa(300);
  await enviar(tramaDe('robo', cuenta), `robo E130 zona ${zona}`);
  await pausa(300);
  await enviar(tramaDe('restauracion', cuenta), 'restauración R130');
  await pausa(300);
  await enviar(tramaDe('cierre', cuenta), 'cierre R401');
  console.log('\nEscenario terminado.');
} else {
  await enviar(tramaDe(comando, cuenta), `${comando} cuenta ${cuenta} zona ${zona}`);
}
