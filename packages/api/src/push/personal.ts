import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, dispositivoPush, envioPush, usuario } from '@monitoring/db';
import { fraseParaPersonal, type CargaAviso } from '@monitoring/shared';
import { enviarPush, pushDisponible, type MensajePush } from './fcm.js';

/**
 * Avisos al personal de la central en el teléfono.
 *
 * No es una copia de la cola: al operador se lo interrumpe solo por lo que no
 * puede esperar (emergencias de un cliente) y por lo que nos deja ciegos
 * (central muda, puente caído). Todo lo demás lo ve en la consola.
 */

const ROLES_PERSONAL = ['admin', 'supervisor', 'operador'] as const;

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

/** Personal activo con teléfono registrado. */
async function destinatariosPersonal(): Promise<{ usuarioId: number; token: string; dispositivoId: number }[]> {
  return db
    .select({ usuarioId: usuario.id, token: dispositivoPush.token, dispositivoId: dispositivoPush.id })
    .from(dispositivoPush)
    .innerJoin(usuario, eq(dispositivoPush.usuarioId, usuario.id))
    .where(and(eq(usuario.activo, true), inArray(usuario.rol, [...ROLES_PERSONAL]), isNotNull(dispositivoPush.token)));
}

/** Manda el aviso al personal. Nunca lanza: el push es lo último que puede frenar algo. */
export async function enviarAvisosPersonal(carga: CargaAviso & { numeroCuenta?: string | null; prefijo?: string | null }, log: Log): Promise<number> {
  if (!pushDisponible()) return 0;
  const frase = fraseParaPersonal(carga);
  if (!frase) return 0;

  let enviados = 0;
  try {
    const gente = await destinatariosPersonal();
    if (gente.length === 0) return 0;
    const mensaje: MensajePush = {
      titulo: frase.titulo,
      cuerpo: frase.cuerpo,
      habla: frase.texto,
      canal: frase.canal,
      datos: { eventoId: String(carga.eventoId), panelId: String(carga.panelId ?? ''), categoria: carga.categoria ?? '', destino: 'personal' },
    };
    for (const g of gente) {
      try {
        const r = await enviarPush(g.token, mensaje, g.usuarioId);
        if (r === 'enviado') enviados++;
        if (r === 'token-invalido') await db.delete(dispositivoPush).where(eq(dispositivoPush.id, g.dispositivoId));
        await db
          .insert(envioPush)
          .values({ eventoId: carga.eventoId, usuarioId: g.usuarioId, dispositivoId: g.dispositivoId, resultado: r, detalle: 'personal de la central' })
          .catch(() => undefined);
      } catch (err) {
        log.warn({ err: (err as Error).message, usuarioId: g.usuarioId }, 'No se pudo avisar al personal');
      }
    }
    if (enviados) log.info({ eventoId: carga.eventoId, enviados, titulo: frase.titulo }, 'Aviso al personal enviado');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Fallo general del aviso al personal');
  }
  return enviados;
}
