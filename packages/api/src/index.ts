import { CANAL_ALARMAS, CANAL_EVENTOS, escucharCanal, pool } from '@monitoring/db';
import { crearApp } from './app.js';

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

const { app, conexiones } = await crearApp();

const detenerEscucha = await escucharCanal([CANAL_ALARMAS, CANAL_EVENTOS], (canal, carga) => {
  const mensaje = JSON.stringify({ canal, carga: carga ? JSON.parse(carga) : null });
  for (const socket of conexiones) {
    if (socket.readyState === socket.OPEN) socket.send(mensaje);
  }
});

const puerto = Number(process.env.PUERTO_API ?? 3000);
await app.listen({ port: puerto, host: '0.0.0.0' });

async function apagar() {
  await detenerEscucha();
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void apagar());
process.on('SIGTERM', () => void apagar());
