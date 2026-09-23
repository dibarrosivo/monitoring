import { esNativo, pedir } from '../api.js';

/**
 * Avisos push con la app cerrada. Solo en la app instalada (Capacitor): el
 * teléfono pide permiso, Firebase le da un token y se lo mandamos al
 * servidor, que desde ahí le avisa aunque la app no esté abierta. Al cerrar
 * sesión el token se borra del servidor para que no lleguen avisos ajenos.
 *
 * Cada paso deja rastro en `estadoPush` (y en el servidor) para poder ver en
 * la pestaña Cuenta dónde se traba si un teléfono no recibe nada.
 */

const CLAVE_TOKEN_PUSH = 'monitoring.pushToken';
const CLAVE_ESTADO = 'monitoring.pushEstado';
let iniciado = false;

export interface EstadoPush {
  etapa: 'no-nativo' | 'sin-plugin' | 'permiso-negado' | 'registrando' | 'registrado' | 'error';
  detalle?: string;
  cuando: number;
}

export function estadoPush(): EstadoPush | null {
  try {
    const crudo = localStorage.getItem(CLAVE_ESTADO);
    return crudo ? (JSON.parse(crudo) as EstadoPush) : null;
  } catch {
    return null;
  }
}

function anotar(etapa: EstadoPush['etapa'], detalle?: string): void {
  const estado: EstadoPush = { etapa, detalle, cuando: Date.now() };
  try {
    localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado));
  } catch {
    // sin almacenamiento igual seguimos
  }
  window.dispatchEvent(new CustomEvent('push-estado', { detail: estado }));
  // El servidor lo anota en su registro: es la única forma de ver qué pasó en un teléfono ajeno
  if (etapa !== 'no-nativo') {
    void pedir('/cliente/dispositivos/diagnostico', { method: 'POST', body: JSON.stringify({ etapa, detalle: detalle ?? null }) }).catch(() => undefined);
  }
}

type Plugin = typeof import('@capacitor/push-notifications').PushNotifications;

async function plugin(): Promise<Plugin | null> {
  if (!esNativo()) return null;
  try {
    return (await import('@capacitor/push-notifications')).PushNotifications;
  } catch (e) {
    anotar('sin-plugin', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function iniciarPush(alTocarAviso: () => void): Promise<void> {
  if (iniciado) return;
  if (!esNativo()) {
    anotar('no-nativo');
    return;
  }
  const push = await plugin();
  if (!push) return;
  iniciado = true;

  try {
    // Canales de Android: el de alarmas suena con sirena y pasa el modo silencio del teléfono.
    // Android no deja cambiar un canal ya creado: si cambia el sonido, cambia el id (y el servidor lo acompaña).
    await push.createChannel({ id: 'alarmas-v2', name: 'Alarmas y emergencias', description: 'Alarmas de su sistema. Suenan con sirena, siempre.', importance: 5, sound: 'sirena.wav', vibration: true, visibility: 1, lights: true });
    await push.createChannel({ id: 'avisos-v2', name: 'Avisos', description: 'Armados, desarmados, fallas y avisos de la central.', importance: 4, sound: 'default', vibration: true, visibility: 1 });
    for (const viejo of ['alarmas', 'avisos']) await push.deleteChannel({ id: viejo }).catch(() => undefined);
  } catch (e) {
    // Un canal mal creado no puede impedir el registro: la notificación sale por el canal por defecto
    anotar('error', `canales: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    await push.addListener('registration', (registro) => {
      try {
        localStorage.setItem(CLAVE_TOKEN_PUSH, registro.value);
      } catch {
        // sin almacenamiento igual se registra
      }
      pedir('/cliente/dispositivos', { method: 'POST', body: JSON.stringify({ token: registro.value, plataforma: 'android' }) })
        .then(() => anotar('registrado'))
        .catch((e) => anotar('error', `servidor: ${e instanceof Error ? e.message : String(e)}`));
    });
    await push.addListener('registrationError', (e) => anotar('error', `firebase: ${JSON.stringify(e).slice(0, 200)}`));
    // Con la app abierta ya avisa el tiempo real; el push en primer plano no se muestra dos veces
    await push.addListener('pushNotificationReceived', () => undefined);
    await push.addListener('pushNotificationActionPerformed', () => alTocarAviso());

    let permiso = await push.checkPermissions();
    if (permiso.receive === 'prompt' || permiso.receive === 'prompt-with-rationale') permiso = await push.requestPermissions();
    if (permiso.receive !== 'granted') {
      anotar('permiso-negado', permiso.receive);
      return;
    }
    anotar('registrando');
    await push.register();
  } catch (e) {
    anotar('error', e instanceof Error ? e.message : String(e));
  }
}

/** Vuelve a intentar el alta (botón en la pestaña Cuenta). */
export async function reintentarPush(alTocarAviso: () => void): Promise<void> {
  iniciado = false;
  await iniciarPush(alTocarAviso);
}

/** Al cerrar sesión: el servidor deja de mandarle avisos a este teléfono. */
export async function detenerPush(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(CLAVE_TOKEN_PUSH);
    localStorage.removeItem(CLAVE_TOKEN_PUSH);
    localStorage.removeItem(CLAVE_ESTADO);
  } catch {
    // nada
  }
  if (!token) return;
  await pedir('/cliente/dispositivos', { method: 'DELETE', body: JSON.stringify({ token }) }).catch(() => undefined);
}
