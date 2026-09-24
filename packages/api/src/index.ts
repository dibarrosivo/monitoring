import { CANAL_ALARMAS, CANAL_EVENTOS, escucharCanal, pool } from '@monitoring/db';
import { crearApp } from './app.js';
import { debeRecibir, refrescarAlcance } from './tiempoReal.js';
import type { CargaAviso } from '@monitoring/shared';
import { enviarAvisosPush } from './push/avisos.js';
import { pushDisponible } from './push/fcm.js';

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

const { app, conexiones } = await crearApp();

const detenerEscucha = await escucharCanal([CANAL_ALARMAS, CANAL_EVENTOS], (canal, carga) => {
  const datos = carga ? (JSON.parse(carga) as { panelId?: number | null }) : null;
  const mensaje = JSON.stringify({ canal, carga: datos });
  // A los teléfonos con la app cerrada les llega por push; abiertos, por el WebSocket de abajo
  if (canal === CANAL_EVENTOS && datos) void enviarAvisosPush(datos as CargaAviso, app.log);
  for (const [socket, suscriptor] of conexiones) {
    if (socket.readyState !== socket.OPEN) continue;
    void refrescarAlcance(suscriptor).then(() => {
      if (socket.readyState === socket.OPEN && debeRecibir(suscriptor, datos)) socket.send(mensaje);
    });
  }
});

const puerto = Number(process.env.PUERTO_API ?? 3000);
await app.listen({ port: puerto, host: '0.0.0.0' });
app.log.info({ push: pushDisponible() }, pushDisponible() ? 'Avisos push por Firebase activos' : 'Avisos push apagados: sin FIREBASE_CREDENCIALES');

async function apagar() {
  await detenerEscucha();
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void apagar());
process.on('SIGTERM', () => void apagar());
