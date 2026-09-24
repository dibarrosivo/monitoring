import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { crearSuscriptor, type Suscriptor } from './tiempoReal.js';
import type { CargaJwt } from './tipos.js';
import { db, pool, sesionOperador } from '@monitoring/db';
import { desc, eq, sql } from 'drizzle-orm';
import { registrarAuth } from './modulos/auth.js';
import { registrarClientes } from './modulos/clientes.js';
import { registrarAlarmas } from './modulos/alarmas.js';
import { registrarComandos } from './modulos/comandos.js';
import { registrarEventos } from './modulos/eventos.js';
import { registrarUsuarios } from './modulos/usuarios.js';
import { registrarClienteApp } from './modulos/clienteApp.js';
import { registrarReportes } from './modulos/reportes.js';
import { registrarConfiguracion } from './modulos/configuracion.js';
import { registrarTablero } from './modulos/tablero.js';
import { registrarSupervision } from './modulos/supervision.js';
import { registrarBridge, registrarBridgesConsulta } from './modulos/bridge.js';
import './tipos.js';

export interface OpcionesApp {
  /** Nivel de log; 'silent' en las pruebas */
  nivelLog?: string;
  jwtSecreto?: string;
}

/**
 * Construye la aplicación sin escucharla: así las pruebas la ejercitan con
 * app.inject() y el arranque real (index.ts) solo agrega el puente WebSocket
 * y el listen.
 */
/** Marca la última actividad en la sesión más reciente del usuario. */
async function tocarSesion(usuarioId: number): Promise<void> {
  const [ultima] = await db
    .select({ id: sesionOperador.id })
    .from(sesionOperador)
    .where(eq(sesionOperador.usuarioId, usuarioId))
    .orderBy(desc(sesionOperador.ingresoEn))
    .limit(1);
  if (ultima) await db.update(sesionOperador).set({ ultimaActividadEn: sql`now()` }).where(eq(sesionOperador.id, ultima.id));
}

export async function crearApp(opciones: OpcionesApp = {}): Promise<{
  app: FastifyInstance;
  conexiones: Map<WebSocket, Suscriptor>;
}> {
  const app = Fastify({ logger: { level: opciones.nivelLog ?? process.env.NIVEL_LOG ?? 'info' } });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: opciones.jwtSecreto ?? process.env.JWT_SECRETO ?? 'solo-desarrollo' });
  await app.register(websocket);

  /*
   * Última actividad del personal: se anota en su sesión más reciente, como
   * mucho una vez por minuto por usuario, sin demorar el pedido. Es lo que
   * permite saber quién está en servicio y desde cuándo no toca la consola.
   */
  const ultimoToque = new Map<number, number>();
  app.decorate('autenticar', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'No autorizado' });
    }
    const u = request.user;
    if (u.rol !== 'cliente' && Date.now() - (ultimoToque.get(u.id) ?? 0) > 60_000) {
      ultimoToque.set(u.id, Date.now());
      void tocarSesion(u.id).catch((err) => app.log.warn({ err }, 'No se pudo anotar la actividad de la sesión'));
    }
  });

  app.decorate('soloPersonal', async (request, reply) => {
    if (request.user.rol === 'cliente') return reply.code(403).send({ error: 'Solo personal de la central' });
  });

  /**
   * Tiempo real: puente entre NOTIFY de Postgres y los WebSockets. Cada
   * conexión lleva su suscriptor, que dice qué puede ver (ver tiempoReal.ts).
   */
  const conexiones = new Map<WebSocket, Suscriptor>();

  // Todas las rutas viven bajo /api: simplifica el proxy de Vite en desarrollo
  // y el enrutamiento de Caddy en producción.
  await app.register(
    async (api) => {
      api.get('/salud', async () => {
        await pool.query('SELECT 1');
        return { ok: true };
      });

      registrarAuth(api);
      // Acuse de recibo del push desde el servicio nativo del teléfono (sin sesión; la clave va firmada)
      api.post('/push/eco', async (request, reply) => {
        const { verificarEco } = await import('./push/fcm.js');
        const cuerpo = (request.body ?? {}) as { eco?: string; estado?: string };
        const datos = typeof cuerpo.eco === 'string' ? verificarEco(cuerpo.eco) : null;
        if (!datos) return reply.code(400).send({ error: 'eco inválido' });
        const estado = String(cuerpo.estado ?? '').slice(0, 500);
        request.log.warn({ eco: datos, estado }, 'Acuse de push del teléfono');
        const { and: y, eq: igual, isNull: nulo, desc: descendente } = await import('drizzle-orm');
        const { envioPush } = await import('@monitoring/db');
        // "recibido" llega apenas entra el mensaje; el estado de la voz llega después, en otro acuse
        const esRecibo = estado.startsWith('recibido');
        const [fila] = await db
          .select({ id: envioPush.id })
          .from(envioPush)
          .where(y(igual(envioPush.eventoId, Number(datos.eventoId)), igual(envioPush.usuarioId, datos.usuarioId), ...(esRecibo ? [nulo(envioPush.recibidoEn)] : [])))
          .orderBy(descendente(envioPush.id))
          .limit(1);
        if (fila) {
          await db
            .update(envioPush)
            .set(esRecibo ? { recibidoEn: new Date() } : { voz: estado, recibidoEn: new Date() })
            .where(y(igual(envioPush.id, fila.id), ...(esRecibo ? [] : [])));
        }
        return { ok: true };
      });
      await api.register(async (sub) => registrarClientes(sub));
      await api.register(async (sub) => registrarAlarmas(sub));
      await api.register(async (sub) => registrarComandos(sub));
      await api.register(async (sub) => registrarEventos(sub));
      await api.register(async (sub) => registrarUsuarios(sub));
      await api.register(async (sub) => registrarClienteApp(sub));
      await api.register(async (sub) => registrarReportes(sub));
      await api.register(async (sub) => registrarConfiguracion(sub));
      await api.register(async (sub) => registrarTablero(sub));
      await api.register(async (sub) => registrarSupervision(sub));
      await api.register(async (sub) => registrarBridge(sub));
      await api.register(async (sub) => registrarBridgesConsulta(sub));

      await api.register(async (sub) => {
        sub.get('/ws', { websocket: true }, (socket, request) => {
          const { token } = request.query as { token?: string };
          let usuario: CargaJwt;
          try {
            usuario = app.jwt.verify<CargaJwt>(token ?? '');
          } catch {
            socket.close(4401, 'No autorizado');
            return;
          }
          // El alcance se calcula antes de aceptar mensajes: un cliente no
          // debe ver ni un evento ajeno mientras se resuelve.
          void crearSuscriptor(usuario).then((suscriptor) => {
            if (socket.readyState !== socket.OPEN) return;
            conexiones.set(socket, suscriptor);
          });
          socket.on('close', () => conexiones.delete(socket));
        });
      });
    },
    { prefix: '/api' },
  );

  return { app, conexiones };
}
