import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, preferenciaAviso } from '@monitoring/db';
import { PREFERENCIAS_PERSONAL_POR_DEFECTO, type PreferenciasPersonal, type VozPush } from '@monitoring/shared';
import type { App } from '../tipos.js';

/**
 * «Mis avisos» del personal de la central: qué le llega a su teléfono y cuándo
 * suena. Cada uno ve y cambia solo lo suyo. La voz es la misma que la de la
 * app de cliente (un teléfono, una voz); el resto va aparte.
 */

const hora = z.string().regex(/^\d{2}:\d{2}$/);
const esquema = z
  .object({
    emergencias: z.boolean(),
    fallasCentral: z.boolean(),
    informativos: z.boolean(),
    silencioDesde: hora.nullable(),
    silencioHasta: hora.nullable(),
    vozPush: z.enum(['siempre', 'solo_alarmas', 'nunca']),
  })
  .refine((d) => (d.silencioDesde === null) === (d.silencioHasta === null), {
    message: 'El horario de silencio lleva desde y hasta, o ninguno',
  });

/** 'HH:MM:SS' de Postgres → 'HH:MM' */
const corta = (t: string | null) => (t ? t.slice(0, 5) : null);

export async function preferenciasPersonalDe(usuarioId: number): Promise<PreferenciasPersonal> {
  const [f] = await db.select().from(preferenciaAviso).where(eq(preferenciaAviso.usuarioId, usuarioId)).limit(1);
  if (!f) return PREFERENCIAS_PERSONAL_POR_DEFECTO;
  return {
    emergencias: f.personalEmergencias,
    fallasCentral: f.personalFallasCentral,
    informativos: f.personalInformativos,
    silencioDesde: corta(f.personalSilencioDesde),
    silencioHasta: corta(f.personalSilencioHasta),
    vozPush: f.vozPush as VozPush,
  };
}

export function registrarAvisosPersonal(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/personal/avisos', async (request) => preferenciasPersonalDe(request.user.id));

  app.put('/personal/avisos', async (request, reply) => {
    const datos = esquema.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const d = datos.data;
    const valores = {
      personalEmergencias: d.emergencias,
      personalFallasCentral: d.fallasCentral,
      personalInformativos: d.informativos,
      personalSilencioDesde: d.silencioDesde,
      personalSilencioHasta: d.silencioHasta,
      vozPush: d.vozPush,
      actualizadoEn: new Date(),
    };
    await db
      .insert(preferenciaAviso)
      .values({ usuarioId: request.user.id, ...valores })
      .onConflictDoUpdate({ target: preferenciaAviso.usuarioId, set: valores });
    return preferenciasPersonalDe(request.user.id);
  });
}
