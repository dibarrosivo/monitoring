import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, hashearClave, usuario, verificarClave } from '@monitoring/db';
import type { App } from '../tipos.js';

const esquemaLogin = z.object({
  email: z.string().email(),
  clave: z.string().min(1),
});

const esquemaCambioClave = z.object({
  actual: z.string().min(1),
  nueva: z.string().min(6),
});

export function registrarAuth(app: App) {
  app.post('/auth/login', async (request, reply) => {
    const cuerpo = esquemaLogin.safeParse(request.body);
    if (!cuerpo.success) return reply.code(400).send({ error: 'Datos inválidos' });

    const [fila] = await db.select().from(usuario).where(eq(usuario.email, cuerpo.data.email)).limit(1);
    if (!fila || !fila.activo || !verificarClave(cuerpo.data.clave, fila.hashClave)) {
      return reply.code(401).send({ error: 'Credenciales inválidas' });
    }

    const token = app.jwt.sign({ id: fila.id, email: fila.email, rol: fila.rol }, { expiresIn: '12h' });
    return { token, usuario: { id: fila.id, email: fila.email, nombre: fila.nombre, rol: fila.rol } };
  });

  /** Cambio de la propia clave (requiere la clave actual). */
  app.post('/auth/clave', { onRequest: [app.autenticar] }, async (request, reply) => {
    const datos = esquemaCambioClave.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'La clave nueva debe tener al menos 6 caracteres' });
    const [fila] = await db.select().from(usuario).where(eq(usuario.id, request.user.id)).limit(1);
    if (!fila || !verificarClave(datos.data.actual, fila.hashClave)) {
      return reply.code(401).send({ error: 'La clave actual no es correcta' });
    }
    await db.update(usuario).set({ hashClave: hashearClave(datos.data.nueva) }).where(eq(usuario.id, fila.id));
    return { ok: true };
  });
}
