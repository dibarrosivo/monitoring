import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { CANAL_ALARMAS, CANAL_EVENTOS, escucharCanal, pool } from '@monitoring/db';
import { registrarAuth } from './modulos/auth.js';
import { registrarClientes } from './modulos/clientes.js';
import { registrarAlarmas } from './modulos/alarmas.js';
import { registrarEventos } from './modulos/eventos.js';
import { registrarUsuarios } from './modulos/usuarios.js';
import { registrarClienteApp } from './modulos/clienteApp.js';
import { registrarReportes } from './modulos/reportes.js';
import { registrarConfiguracion } from './modulos/configuracion.js';
import { registrarTablero } from './modulos/tablero.js';
import './tipos.js';

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

const app = Fastify({ logger: { level: process.env.NIVEL_LOG ?? 'info' } });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRETO ?? 'solo-desarrollo' });
await app.register(websocket);

app.decorate('autenticar', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'No autorizado' });
  }
});

app.decorate('soloPersonal', async (request, reply) => {
  if (request.user.rol === 'cliente') return reply.code(403).send({ error: 'Solo personal de la central' });
});

/** Tiempo real: puente entre NOTIFY de Postgres y los WebSockets de la consola. */
const conexiones = new Set<WebSocket>();

// Todas las rutas viven bajo /api: simplifica el proxy de Vite en desarrollo
// y el enrutamiento de Caddy en producción.
await app.register(
  async (api) => {
    api.get('/salud', async () => {
      await pool.query('SELECT 1');
      return { ok: true };
    });

    registrarAuth(api);
    await api.register(async (sub) => registrarClientes(sub));
    await api.register(async (sub) => registrarAlarmas(sub));
    await api.register(async (sub) => registrarEventos(sub));
    await api.register(async (sub) => registrarUsuarios(sub));
    await api.register(async (sub) => registrarClienteApp(sub));
    await api.register(async (sub) => registrarReportes(sub));
    await api.register(async (sub) => registrarConfiguracion(sub));
    await api.register(async (sub) => registrarTablero(sub));

    await api.register(async (sub) => {
      sub.get('/ws', { websocket: true }, (socket, request) => {
        const { token } = request.query as { token?: string };
        try {
          app.jwt.verify(token ?? '');
        } catch {
          socket.close(4401, 'No autorizado');
          return;
        }
        conexiones.add(socket);
        socket.on('close', () => conexiones.delete(socket));
      });
    });
  },
  { prefix: '/api' },
);

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
