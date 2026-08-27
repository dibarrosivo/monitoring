import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { configuracion, db } from '@monitoring/db';
import type { App } from '../tipos.js';

/**
 * Parámetros de la central. Leer: todo el personal (la consola los necesita
 * para comportarse); escribir: solo administradores.
 */

const esquemaHombreMuerto = z.object({
  activo: z.boolean(),
  intervaloMin: z.number().int().min(1).max(480),
  respuestaSeg: z.number().int().min(10).max(600),
});

export type ConfigHombreMuerto = z.infer<typeof esquemaHombreMuerto>;

const HOMBRE_MUERTO_DEFECTO: ConfigHombreMuerto = { activo: true, intervaloMin: 30, respuestaSeg: 90 };

async function leerHombreMuerto(): Promise<ConfigHombreMuerto> {
  const [fila] = await db.select().from(configuracion).where(eq(configuracion.clave, 'hombre_muerto')).limit(1);
  const parseado = esquemaHombreMuerto.safeParse(fila?.valor);
  return parseado.success ? parseado.data : HOMBRE_MUERTO_DEFECTO;
}

export function registrarConfiguracion(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/configuracion', async () => ({ hombreMuerto: await leerHombreMuerto() }));

  app.put('/configuracion/hombre-muerto', async (request, reply) => {
    if (request.user.rol !== 'admin') return reply.code(403).send({ error: 'Solo administradores' });
    const datos = esquemaHombreMuerto.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    await db
      .insert(configuracion)
      .values({ clave: 'hombre_muerto', valor: datos.data })
      .onConflictDoUpdate({ target: configuracion.clave, set: { valor: datos.data } });
    return { hombreMuerto: datos.data };
  });
}
