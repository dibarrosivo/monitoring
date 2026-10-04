import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { acceso, db, hashearClave, sesionOperador, usuario, verificarClave } from '@monitoring/db';
import { crearLimitador } from '../limite.js';
import { CLAVE_MINIMA } from '@monitoring/shared';
import type { App } from '../tipos.js';

/*
 * Límite de intentos del login. Antes no había ninguno: con las claves de
 * administrador adivinables, se podía probar sin parar, y un administrador
 * puede desarmar paneles a distancia. Dos cuentas a la vez:
 * - por correo: 5 fallos en 15 minutos traban esa cuenta, venga de donde venga;
 * - por IP: 20 fallos en 15 minutos, para quien prueba muchas cuentas.
 * Se cuentan solo los fallos: varios operadores entran desde la misma IP de la
 * oficina, y contar los logins buenos los trabaría entre ellos. Un login
 * correcto borra los fallos de esa cuenta.
 */
const VENTANA_MS = 15 * 60_000;
const fallosPorCuenta = crearLimitador({ max: 5, ventanaMs: VENTANA_MS });
const fallosPorIp = crearLimitador({ max: 20, ventanaMs: VENTANA_MS });

/*
 * Hash de una clave que no existe, para gastar el mismo tiempo cuando el correo
 * no está registrado. Sin esto, la demora delataba qué correos tienen cuenta
 * (scrypt solo corría cuando el usuario existía).
 */
const HASH_DE_RELLENO = hashearClave('relleno-para-igualar-tiempos');

const esquemaLogin = z.object({
  email: z.string().email(),
  clave: z.string().min(1),
});

const esquemaCambioClave = z.object({
  actual: z.string().min(1),
  nueva: z.string().min(CLAVE_MINIMA),
});

export function registrarAuth(app: App) {
  app.post('/auth/login', async (request, reply) => {
    const cuerpo = esquemaLogin.safeParse(request.body);
    if (!cuerpo.success) return reply.code(400).send({ error: 'Datos inválidos' });

    const correo = cuerpo.data.email.trim().toLowerCase();
    const ip = request.ip ?? '';
    // Se mira ANTES de verificar la clave: si no, el bloqueo no frena nada
    if (fallosPorCuenta.bloqueado(correo) || fallosPorIp.bloqueado(ip)) {
      request.log.warn({ correo, ip }, 'Login frenado por demasiados intentos');
      return reply.code(429).send({ error: 'Demasiados intentos. Espere unos minutos y vuelva a probar.' });
    }

    const [fila] = await db.select().from(usuario).where(eq(usuario.email, cuerpo.data.email)).limit(1);
    const claveCorrecta = verificarClave(cuerpo.data.clave, fila?.hashClave ?? HASH_DE_RELLENO);
    if (!fila || !fila.activo || !claveCorrecta) {
      fallosPorCuenta.anotar(correo);
      fallosPorIp.anotar(ip);
      return reply.code(401).send({ error: 'Credenciales inválidas' });
    }
    fallosPorCuenta.reiniciar(correo);

    // 30 días para todos: la central se opera desde el teléfono y nadie quiere
    // volver a entrar a mitad de turno. Lo que antes cuidaba la caducidad corta
    // (dar de baja a alguien y que pierda el acceso) ahora lo hace la
    // verificación de cada pedido contra la base, en app.ts.
    const token = app.jwt.sign({ id: fila.id, email: fila.email, rol: fila.rol }, { expiresIn: '30d' });
    // El personal deja rastro de cuándo entró en servicio (los clientes no)
    if (fila.rol !== 'cliente') {
      await db.insert(sesionOperador).values({
        usuarioId: fila.id,
        ip: request.ip?.slice(0, 64) ?? null,
        agente: (request.headers['user-agent'] ?? '').toString().slice(0, 300) || null,
      });
    }
    // ¿Es además cliente de sí mismo? Con accesos cargados, la app abre en la
    // pantalla de cliente aunque sea personal de la central
    const [suyo] = await db.select({ id: acceso.id }).from(acceso).where(eq(acceso.usuarioId, fila.id)).limit(1);
    const tieneAcceso = Boolean(suyo);

    return {
      token,
      // `tieneAcceso` decide con qué pantalla abre la app: un administrador que
      // además es cliente de sí mismo arranca viendo su alarma, no la consola
      usuario: { id: fila.id, email: fila.email, nombre: fila.nombre, rol: fila.rol, tieneAcceso },
    };
  });

  /** Cambio de la propia clave (requiere la clave actual). */
  app.post('/auth/clave', { onRequest: [app.autenticar] }, async (request, reply) => {
    const datos = esquemaCambioClave.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: `La clave nueva debe tener al menos ${CLAVE_MINIMA} caracteres` });
    const [fila] = await db.select().from(usuario).where(eq(usuario.id, request.user.id)).limit(1);
    if (!fila || !verificarClave(datos.data.actual, fila.hashClave)) {
      return reply.code(401).send({ error: 'La clave actual no es correcta' });
    }
    await db.update(usuario).set({ hashClave: hashearClave(datos.data.nueva) }).where(eq(usuario.id, fila.id));
    return { ok: true };
  });
}
