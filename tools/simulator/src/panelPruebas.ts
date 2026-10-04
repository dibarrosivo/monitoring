/**
 * Panel de pruebas para el período de testing de Google Play.
 *
 * Google exige un usuario y una clave para que su revisor pueda entrar a la
 * app, y los 12 testers del período de pruebas cerradas necesitan ver algo al
 * abrirla. Este programa hace de panel de alarma inventado: manda al receptor
 * las mismas tramas SIA DC-09 que mandaría un equipo real, con un día de
 * trabajo creíble, para que la cuenta de pruebas tenga historial.
 *
 * Es deuda con fecha de vencimiento: al terminar el período se apaga el
 * contenedor y se corre scripts/borrar-pruebas.sh.
 *
 * Uso:
 *   tsx tools/simulator/src/panelPruebas.ts
 *   PRUEBAS_CUENTA=5199 PRUEBAS_HOST=receptor PRUEBAS_RITMO=rapido tsx ...
 */
import net from 'node:net';
import { construirTramaAdmCid, construirTramaAdmCidCifrada, normalizarClaveAes } from '@monitoring/protocols';

const CUENTA = process.env.PRUEBAS_CUENTA ?? '5199';
const HOST = process.env.PRUEBAS_HOST ?? '127.0.0.1';
const PUERTO = Number(process.env.PRUEBAS_PUERTO ?? process.env.PUERTO_DC09_TCP ?? 9999);
const ZONA_HORARIA = process.env.PRUEBAS_ZONA_HORARIA ?? 'America/Caracas';
/** 'rapido' comprime el día en minutos, para probar el simulador sin esperarlo. */
const RAPIDO = process.env.PRUEBAS_RITMO === 'rapido';
/*
 * Con clave, las tramas salen cifradas con AES, como las de un Hikvision
 * configurado así. Sirve para probar el receptor en producción el día que se
 * activa el cifrado, antes de tocar un panel real.
 */
const CLAVE = process.env.PRUEBAS_CLAVE_AES ? normalizarClaveAes(process.env.PRUEBAS_CLAVE_AES) : undefined;
if (process.env.PRUEBAS_CLAVE_AES && !CLAVE) throw new Error('PRUEBAS_CLAVE_AES inválida: hexadecimal de 32, 48 o 64 caracteres');

/** Un evento del guion, con la hora del día a la que toca mandarlo. */
interface Paso {
  hora: number;
  minuto: number;
  codigo: string;
  zona?: string;
  usuario?: string;
  que: string;
}

/*
 * El día de un local chico: abre en la mañana, cierra en la tarde, manda su
 * prueba periódica cada 6 horas y de vez en cuando una avería que se
 * restaura sola. Nada de alarmas de robo: una cuenta de pruebas que dispara
 * alarmas le mete ruido a la cola de los operadores de verdad.
 */
const GUION: Paso[] = [
  { hora: 0, minuto: 10, codigo: 'E602', que: 'prueba periódica' },
  { hora: 6, minuto: 10, codigo: 'E602', que: 'prueba periódica' },
  { hora: 7, minuto: 40, codigo: 'E401', usuario: '002', que: 'desarmado de la mañana' },
  { hora: 12, minuto: 10, codigo: 'E602', que: 'prueba periódica' },
  { hora: 13, minuto: 25, codigo: 'E570', zona: '007', que: 'anulación de la zona del depósito' },
  { hora: 14, minuto: 5, codigo: 'R570', zona: '007', que: 'la zona vuelve a su lugar' },
  { hora: 17, minuto: 50, codigo: 'E301', que: 'se va la luz' },
  { hora: 18, minuto: 35, codigo: 'R301', que: 'vuelve la luz' },
  { hora: 18, minuto: 50, codigo: 'R401', usuario: '002', que: 'armado de la tarde' },
  { hora: 18, minuto: 10, codigo: 'E602', que: 'prueba periódica' },
];

function enviar(paso: Paso): Promise<void> {
  return new Promise((listo) => {
    // 'E602' se parte en el calificador (E = evento nuevo, R = restauración) y el código Contact ID.
    // La hora va siempre, en GMT como pide el estándar: sin ella una trama cifrada se rechaza.
    const base = {
      cuenta: CUENTA,
      calificador: (paso.codigo[0] === 'R' ? 3 : 1) as 1 | 3,
      codigoCid: paso.codigo.slice(1),
      particion: '01',
      zona: paso.zona ?? paso.usuario ?? '000',
      marcaTiempo: new Date(),
    };
    const trama = CLAVE ? construirTramaAdmCidCifrada({ ...base, claveAes: CLAVE }) : construirTramaAdmCid(base);
    const socket = net.createConnection({ host: HOST, port: PUERTO }, () => socket.write(trama));
    const cerrar = (nota: string) => {
      socket.destroy();
      console.log(`${new Date().toISOString()} ${paso.codigo} ${paso.que} — ${nota}`);
      listo();
    };
    socket.once('data', () => cerrar('recibido'));
    socket.once('error', (e) => cerrar(`sin respuesta: ${e.message}`));
    socket.setTimeout(10_000, () => cerrar('sin respuesta: tiempo agotado'));
  });
}

/** Minutos transcurridos del día en la zona horaria de la central. */
function minutosDelDia(ahora: Date): number {
  const f = new Intl.DateTimeFormat('es', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ahora);
  const h = Number(f.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(f.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

async function porReloj(): Promise<void> {
  const pasos = [...GUION].sort((a, b) => a.hora * 60 + a.minuto - (b.hora * 60 + b.minuto));
  console.log(`Panel de pruebas ${CUENTA} → ${HOST}:${PUERTO} (${pasos.length} eventos por día, ${ZONA_HORARIA})`);
  // Lo que ya pasó hoy no se manda: el programa se suma al día en curso
  let siguiente = pasos.findIndex((p) => p.hora * 60 + p.minuto > minutosDelDia(new Date()));
  if (siguiente < 0) siguiente = 0;

  for (;;) {
    const paso = pasos[siguiente]!;
    const ahora = minutosDelDia(new Date());
    const falta = paso.hora * 60 + paso.minuto - ahora;
    const esperaMin = falta > 0 ? falta : falta + 24 * 60;
    await new Promise((r) => setTimeout(r, esperaMin * 60_000));
    await enviar(paso).catch((e) => console.error('falló el envío:', e));
    siguiente = (siguiente + 1) % pasos.length;
  }
}

async function rapido(): Promise<void> {
  console.log(`Panel de pruebas ${CUENTA} → ${HOST}:${PUERTO} (ritmo rápido: un evento cada 5 s${CLAVE ? ', cifrado' : ''})`);
  for (const paso of GUION) {
    await enviar(paso);
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

await (RAPIDO ? rapido() : porReloj());
