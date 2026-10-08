import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { crearSuscriptor, type Suscriptor } from './tiempoReal.js';
import type { CargaJwt } from './tipos.js';
import { db, pool, sesionOperador, usuario } from '@monitoring/db';
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
import { registrarTasa } from './modulos/tasa.js';
import { registrarCobros } from './modulos/cobros.js';
import { registrarContactoPublico, registrarContactos } from './modulos/contacto.js';
import { registrarDispositivosPush } from './modulos/dispositivos.js';
import { registrarTurnos } from './modulos/turnos.js';
import { registrarSupervision } from './modulos/supervision.js';
import { registrarBridge, registrarBridgesConsulta } from './modulos/bridge.js';
import './tipos.js';
import { secretoSesiones } from './secretos.js';
import { registrarAvisosPersonal } from './modulos/avisosPersonal.js';

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
  const app = Fastify({
    logger: { level: opciones.nivelLog ?? process.env.NIVEL_LOG ?? 'info' },
    /*
     * La API solo se alcanza a través de Caddy, que pone la IP real del cliente
     * en X-Forwarded-For. Sin esto, request.ip era la IP interna de Caddy para
     * todo el mundo: el límite del formulario de la landing era uno solo para
     * todos los visitantes, y el registro de sesiones del personal anotaba
     * 172.18.0.x en vez de desde dónde entró cada uno. Solo se cree a un
     * proxy con dirección privada (Caddy, en la red de Docker), nunca a una
     * cabecera que mande el cliente desde internet.
     */
    trustProxy: 'loopback,uniquelocal',
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: secretoSesiones(opciones.jwtSecreto) });
  await app.register(websocket);

  /*
   * Última actividad del personal: se anota en su sesión más reciente, como
   * mucho una vez por minuto por usuario, sin demorar el pedido. Es lo que
   * permite saber quién está en servicio y desde cuándo no toca la consola.
   */
  const ultimoToque = new Map<number, number>();

  /*
   * Con sesiones largas, el token por sí solo no alcanza: si se da de baja a
   * alguien o se le cambia el rol, su sesión seguiría valiendo un mes. Por eso
   * cada pedido comprueba contra la base que el usuario siga activo y con qué
   * rol, con una caché de un minuto para no consultar en cada llamada. Efecto
   * lateral bienvenido: un cambio de rol se aplica solo, sin volver a entrar.
   */
  // En pruebas se apaga: ahí las tablas se vacían reiniciando los
  // identificadores, así que un mismo id es otra persona en cada caso. En
  // producción los ids nunca se reciclan y la caché es segura.
  const CACHE_MS = process.env.NODE_ENV === 'test' ? 0 : 60_000;
  const vigencia = new Map<number, { hasta: number; activo: boolean; rol: CargaJwt['rol'] }>();
  async function usuarioVigente(id: number): Promise<{ activo: boolean; rol: CargaJwt['rol'] } | null> {
    const enCache = vigencia.get(id);
    if (enCache && enCache.hasta > Date.now()) return enCache;
    const [fila] = await db.select({ activo: usuario.activo, rol: usuario.rol }).from(usuario).where(eq(usuario.id, id)).limit(1);
    if (!fila) return null;
    vigencia.set(id, { hasta: Date.now() + CACHE_MS, activo: fila.activo, rol: fila.rol });
    return fila;
  }

  app.decorate('autenticar', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'No autorizado' });
    }
    const u = request.user;
    const vigente = await usuarioVigente(u.id);
    if (!vigente || !vigente.activo) return reply.code(401).send({ error: 'No autorizado' });
    u.rol = vigente.rol;
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

  /*
   * Una conexión en vivo puede quedar abierta días. Cada minuto se vuelve a
   * mirar en la base a sus dueños: si alguien quedó dado de baja o le
   * cambiaron el rol, se le cierra el canal (la app vuelve a conectarse y, si
   * sigue habilitado, entra con el alcance nuevo).
   */
  const repasoEnVivo = setInterval(() => {
    void (async () => {
      for (const [socket, suscriptor] of conexiones) {
        const vigente = await usuarioVigente(suscriptor.usuarioId);
        if (!vigente || !vigente.activo || vigente.rol !== suscriptor.rol) {
          conexiones.delete(socket);
          socket.close(4401, 'Sesión revocada');
        }
      }
    })().catch((err) => app.log.warn({ err }, 'No se pudo repasar las conexiones en vivo'));
  }, 60_000);
  repasoEnVivo.unref();
  app.addHook('onClose', async () => clearInterval(repasoEnVivo));

  // Todas las rutas viven bajo /api: simplifica el proxy de Vite en desarrollo
  // y el enrutamiento de Caddy en producción.
  await app.register(
    async (api) => {
      api.get('/salud', async () => {
        await pool.query('SELECT 1');
        return { ok: true };
      });

      registrarAuth(api);
      registrarContactoPublico(api);
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
      await api.register(async (sub) => registrarTasa(sub));
      await api.register(async (sub) => registrarCobros(sub));
      await api.register(async (sub) => registrarContactos(sub));
      await api.register(async (sub) => registrarDispositivosPush(sub));
      await api.register(async (sub) => registrarTurnos(sub));
      await api.register(async (sub) => registrarAvisosPersonal(sub));
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
          /*
           * Mismo criterio que el resto de la API: el token dura 30 días, así
           * que no alcanza con que la firma sea válida. Antes este canal se
           * salteaba la verificación contra la base: alguien dado de baja que
           * guardó su sesión seguía recibiendo en vivo las alarmas de todos los
           * clientes hasta que el token venciera. Y el rol se tomaba del token,
           * no de la base, así que bajarle el rol a alguien no cambiaba lo que
           * veía. El alcance se calcula antes de aceptar mensajes: un cliente
           * no debe ver ni un evento ajeno mientras se resuelve.
           */
          void (async () => {
            const vigente = await usuarioVigente(usuario.id);
            if (!vigente || !vigente.activo) {
              socket.close(4401, 'No autorizado');
              return;
            }
            const suscriptor = await crearSuscriptor({ ...usuario, rol: vigente.rol });
            if (socket.readyState !== socket.OPEN) return;
            conexiones.set(socket, suscriptor);
          })().catch((err) => {
            app.log.warn({ err }, 'No se pudo abrir el canal en vivo');
            socket.close(1011, 'Error');
          });
          socket.on('close', () => conexiones.delete(socket));
        });
      });
    },
    { prefix: '/api' },
  );

  return { app, conexiones };
}
