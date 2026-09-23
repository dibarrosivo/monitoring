import { esNativo, pedir } from '../api.js';

/**
 * Avisos push con la app cerrada. Solo en la app instalada (Capacitor): el
 * teléfono pide permiso, Firebase le da un token y se lo mandamos al
 * servidor, que desde ahí le avisa aunque la app no esté abierta. Al cerrar
 * sesión el token se borra del servidor para que no lleguen avisos ajenos.
 */

const CLAVE_TOKEN_PUSH = 'monitoring.pushToken';
let iniciado = false;

type Plugin = typeof import('@capacitor/push-notifications').PushNotifications;

async function plugin(): Promise<Plugin | null> {
  if (!esNativo()) return null;
  try {
    return (await import('@capacitor/push-notifications')).PushNotifications;
  } catch {
    return null;
  }
}

export async function iniciarPush(alTocarAviso: () => void): Promise<void> {
  if (iniciado) return;
  const push = await plugin();
  if (!push) return;
  iniciado = true;

  // Canales de Android: el de alarmas suena fuerte y pasa el modo silencio del teléfono
  // Android no deja cambiar un canal ya creado: si cambia el sonido, cambia el id (y el servidor lo acompaña)
  await push.createChannel({ id: 'alarmas-v2', name: 'Alarmas y emergencias', description: 'Alarmas de su sistema. Suenan con sirena, siempre.', importance: 5, sound: 'sirena.wav', vibration: true, visibility: 1, lights: true });
  await push.createChannel({ id: 'avisos-v2', name: 'Avisos', description: 'Armados, desarmados, fallas y avisos de la central.', importance: 4, sound: 'default', vibration: true, visibility: 1 });
  for (const viejo of ['alarmas', 'avisos']) await push.deleteChannel({ id: viejo }).catch(() => undefined);

  await push.addListener('registration', (registro) => {
    try {
      localStorage.setItem(CLAVE_TOKEN_PUSH, registro.value);
    } catch {
      // sin almacenamiento igual se registra
    }
    void pedir('/cliente/dispositivos', { method: 'POST', body: JSON.stringify({ token: registro.value, plataforma: 'android' }) }).catch(() => undefined);
  });
  await push.addListener('registrationError', () => undefined);
  // Con la app abierta ya avisa el tiempo real; el push en primer plano no se muestra dos veces
  await push.addListener('pushNotificationReceived', () => undefined);
  await push.addListener('pushNotificationActionPerformed', () => alTocarAviso());

  let permiso = await push.checkPermissions();
  if (permiso.receive === 'prompt' || permiso.receive === 'prompt-with-rationale') permiso = await push.requestPermissions();
  if (permiso.receive === 'granted') await push.register();
}

/** Al cerrar sesión: el servidor deja de mandarle avisos a este teléfono. */
export async function detenerPush(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(CLAVE_TOKEN_PUSH);
    localStorage.removeItem(CLAVE_TOKEN_PUSH);
  } catch {
    // nada
  }
  if (!token) return;
  await pedir('/cliente/dispositivos', { method: 'DELETE', body: JSON.stringify({ token }) }).catch(() => undefined);
}
