import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, dispositivoPush, envioPush, usuario } from '@monitoring/db';
import { fraseParaPersonal, type CargaAviso } from '@monitoring/shared';
import { enviarPush, pushDisponible, type MensajePush } from './fcm.js';
import { usuariosDeGuardia } from '../modulos/turnos.js';

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

/**
 * Manda el aviso al personal. Devuelve a quién se le avisó, para que el aviso
 * al cliente no se lo mande otra vez a la misma persona. Nunca lanza: el push
 * es lo último que puede frenar algo.
 */
export async function enviarAvisosPersonal(carga: CargaAviso & { numeroCuenta?: string | null; prefijo?: string | null }, log: Log): Promise<number[]> {
  if (!pushDisponible()) return [];
  const frase = fraseParaPersonal(carga);
  if (!frase) return [];

  const avisados = new Set<number>();
  let enviados = 0;
  try {
    const todos = await destinatariosPersonal();
    if (todos.length === 0) return [];

    /*
     * Las fallas de la propia central le importan a todo el mundo, estén o no
     * de turno: si nos quedamos ciegos, se enteran todos. Una emergencia de un
     * cliente, en cambio, es del que está de guardia; y si no hay nadie
     * asignado, o el asignado no tiene teléfono registrado, se le avisa a
     * todos, que es mejor que no avisarle a nadie.
     */
    const fallaDeLaCentral = ['SIS-GEN', 'BRIDGE', 'BRIDGE-R'].includes(carga.codigo ?? '');
    let gente = todos;
    if (!fallaDeLaCentral) {
      const deGuardia = await usuariosDeGuardia();
      const asignados = todos.filter((g) => deGuardia.includes(g.usuarioId));
      if (asignados.length > 0) gente = asignados;
    }
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
        if (r === 'enviado') {
          enviados++;
          avisados.add(g.usuarioId);
        }
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
  return [...avisados];
}
