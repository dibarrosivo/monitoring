import { createHmac, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CANAL_PUSH, SONIDO_ALARMA, type CanalPush } from '@monitoring/shared';

/**
 * Envío por Firebase Cloud Messaging (API HTTP v1) sin SDK: la cuenta de
 * servicio firma un JWT, Google lo cambia por un token de acceso de una
 * hora, y con ese token se manda cada mensaje. Si no hay credenciales
 * configuradas (FIREBASE_CREDENCIALES apunta a un archivo inexistente), el
 * push queda apagado y el resto del sistema ni se entera.
 */

interface CuentaServicio {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cuenta: CuentaServicio | null | undefined;
let tokenAcceso: { valor: string; vence: number } | null = null;

function cargarCuenta(): CuentaServicio | null {
  if (cuenta !== undefined) return cuenta;
  const ruta = process.env.FIREBASE_CREDENCIALES;
  try {
    cuenta = ruta ? (JSON.parse(readFileSync(ruta, 'utf8')) as CuentaServicio) : null;
  } catch {
    cuenta = null;
  }
  return cuenta;
}

export function pushDisponible(): boolean {
  return cargarCuenta() !== null;
}

function base64url(entrada: Buffer | string): string {
  return Buffer.from(entrada).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function obtenerTokenAcceso(): Promise<string> {
  const c = cargarCuenta();
  if (!c) throw new Error('Push sin configurar');
  if (tokenAcceso && tokenAcceso.vence > Date.now() + 60_000) return tokenAcceso.valor;
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = base64url(
    JSON.stringify({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: c.token_uri, iat: ahora, exp: ahora + 3600 }),
  );
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(c.private_key);
  const jwt = `${cabecera}.${cuerpo}.${base64url(firma)}`;
  const respuesta = await fetch(c.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!respuesta.ok) throw new Error(`Google no dio token de acceso: ${respuesta.status} ${await respuesta.text()}`);
  const datos = (await respuesta.json()) as { access_token: string; expires_in: number };
  tokenAcceso = { valor: datos.access_token, vence: Date.now() + datos.expires_in * 1000 };
  return tokenAcceso.valor;
}

/** Clave de acuse firmada: el teléfono la devuelve con el estado de entrega y de la voz, sin sesión. */
export function claveEco(usuarioId: number, eventoId: string | undefined): string {
  const cuerpo = `${usuarioId}.${eventoId ?? '0'}.${Math.floor(Date.now() / 1000)}`;
  const firma = createHmac('sha256', process.env.JWT_SECRETO ?? 'solo-desarrollo').update(cuerpo).digest('hex').slice(0, 24);
  return `${cuerpo}.${firma}`;
}

export function verificarEco(clave: string): { usuarioId: number; eventoId: string } | null {
  const partes = clave.split('.');
  if (partes.length !== 4) return null;
  const cuerpo = partes.slice(0, 3).join('.');
  const firma = createHmac('sha256', process.env.JWT_SECRETO ?? 'solo-desarrollo').update(cuerpo).digest('hex').slice(0, 24);
  if (firma !== partes[3]) return null;
  if (Math.floor(Date.now() / 1000) - Number(partes[2]) > 3600) return null;
  return { usuarioId: Number(partes[0]), eventoId: partes[1]! };
}

export interface MensajePush {
  titulo: string;
  cuerpo: string;
  /** Lo que el teléfono dice en voz alta (motor de voz de Android) con la app cerrada */
  habla?: string;
  /** 'alarmas' suena fuerte y pasa el modo silencio; 'avisos' es una notificación normal */
  canal: CanalPush;
  datos?: Record<string, string>;
}

export type ResultadoPush = 'enviado' | 'token-invalido' | 'error';

/** Manda un mensaje a un teléfono. 'token-invalido' significa que hay que borrar ese token. */
export async function enviarPush(token: string, mensaje: MensajePush, usuarioId = 0): Promise<ResultadoPush> {
  const c = cargarCuenta();
  if (!c) return 'error';
  const acceso = await obtenerTokenAcceso();
  const respuesta = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${acceso}`, 'content-type': 'application/json' },
    // Solo datos, sin bloque "notification": así Android entrega el mensaje al
    // servicio nativo de la app aunque esté cerrada, y es la app la que arma la
    // notificación y la dice en voz alta. Con "notification" el sistema la
    // mostraría solo, muda y sin contexto.
    body: JSON.stringify({
      message: {
        token,
        data: { ...(mensaje.datos ?? {}), titulo: mensaje.titulo, cuerpo: mensaje.cuerpo, habla: mensaje.habla === undefined ? mensaje.cuerpo : mensaje.habla, canal: mensaje.canal, eco: claveEco(usuarioId, mensaje.datos?.eventoId) },
        android: { priority: 'high', ttl: '3600s' },
      },
    }),
  });
  if (respuesta.ok) return 'enviado';
  const texto = await respuesta.text();
  if (respuesta.status === 404 || texto.includes('UNREGISTERED') || texto.includes('INVALID_ARGUMENT')) return 'token-invalido';
  throw new Error(`FCM ${respuesta.status}: ${texto.slice(0, 200)}`);
}

/**
 * Reenvío como notificación simple: mensaje CON bloque "notification", que
 * Android muestra por su cuenta aunque la app esté muerta. Sin voz, pero
 * llega. Es la red de seguridad cuando el teléfono no acusó el mensaje de
 * datos (Xiaomi y otros que matan procesos en segundo plano).
 */
export async function enviarPushSimple(token: string, mensaje: MensajePush): Promise<ResultadoPush> {
  const c = cargarCuenta();
  if (!c) return 'error';
  const acceso = await obtenerTokenAcceso();
  const respuesta = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${acceso}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: mensaje.titulo, body: mensaje.cuerpo },
        data: { ...(mensaje.datos ?? {}), reenvio: '1' },
        android: {
          priority: 'high',
          notification: {
            channel_id: CANAL_PUSH[mensaje.canal],
            sound: mensaje.canal === 'alarmas' ? SONIDO_ALARMA : 'default',
            notification_priority: mensaje.canal === 'alarmas' ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
          },
        },
      },
    }),
  });
  if (respuesta.ok) return 'enviado';
  const texto = await respuesta.text();
  if (respuesta.status === 404 || texto.includes('UNREGISTERED') || texto.includes('INVALID_ARGUMENT')) return 'token-invalido';
  throw new Error(`FCM ${respuesta.status}: ${texto.slice(0, 200)}`);
}
