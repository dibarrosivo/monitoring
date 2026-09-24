import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { acceso, cliente, db, dispositivoPush, envioPush, panel, preferenciaAviso, sitio, usuario } from '@monitoring/db';
import { enZona } from '@monitoring/engine';
import { conVoz, fraseParaEvento, PREFERENCIAS_POR_DEFECTO, quiereRecibir, type CargaAviso, type GrupoAviso, type PreferenciasAviso, type VozPush } from '@monitoring/shared';
import { enviarPush, enviarPushSimple, pushDisponible, type MensajePush } from './fcm.js';

/**
 * Avisos push a los teléfonos: para cada evento, a quién le toca (los
 * accesos que alcanzan ese panel), qué quiere recibir (sus preferencias) y
 * qué se le dice. Las frases y las reglas de preferencias viven en
 * @monitoring/shared: son las mismas que aplica la app cuando está abierta.
 */

/**
 * ¿Le llega este aviso al usuario ahora? Las preferencias se evalúan en la
 * hora de la central, no en la del servidor (UTC): la franja de silencio
 * "22:00 a 07:00" es la noche del cliente.
 */
export function quiereRecibirAhora(prefs: PreferenciasAviso, grupo: GrupoAviso | null, ahora: Date = new Date()): boolean {
  return quiereRecibir(prefs, grupo, enZona(null, ahora));
}

/** Usuarios de la app cuyos accesos alcanzan este panel, con su cantidad de sitios (para nombrar el lugar). */
async function destinatarios(panelId: number): Promise<{ usuarioId: number; sitios: number }[]> {
  const [p] = await db
    .select({ sitioId: sitio.id, clienteId: sitio.clienteId })
    .from(panel)
    .innerJoin(sitio, eq(panel.sitioId, sitio.id))
    .where(eq(panel.id, panelId))
    .limit(1);
  if (!p) return [];
  const filas = await db
    .select({ usuarioId: acceso.usuarioId })
    .from(acceso)
    .innerJoin(usuario, eq(acceso.usuarioId, usuario.id))
    .where(
      and(
        eq(usuario.activo, true),
        eq(usuario.rol, 'cliente'),
        eq(acceso.clienteId, p.clienteId),
        or(eq(acceso.panelId, panelId), and(isNull(acceso.panelId), eq(acceso.sitioId, p.sitioId)), and(isNull(acceso.panelId), isNull(acceso.sitioId))),
      ),
    );
  const ids = [...new Set(filas.map((f) => f.usuarioId))];
  if (ids.length === 0) return [];
  // Cuántos sitios ve cada uno: con más de uno, el aviso nombra el lugar
  const alcances = await db
    .select({ usuarioId: acceso.usuarioId, sitioId: acceso.sitioId, clienteId: acceso.clienteId })
    .from(acceso)
    .where(inArray(acceso.usuarioId, ids));
  const sitiosPorCliente = await db.select({ clienteId: sitio.clienteId, id: sitio.id }).from(sitio).innerJoin(cliente, eq(sitio.clienteId, cliente.id));
  return ids.map((usuarioId) => {
    const vistos = new Set<number>();
    for (const a of alcances.filter((x) => x.usuarioId === usuarioId)) {
      if (a.sitioId) vistos.add(a.sitioId);
      else for (const s of sitiosPorCliente.filter((s) => s.clienteId === a.clienteId)) vistos.add(s.id);
    }
    return { usuarioId, sitios: vistos.size };
  });
}

/** Manda el aviso de un evento a todos los teléfonos que corresponda. Nunca lanza: el push es lo último que puede frenar algo. */
export async function enviarAvisosPush(carga: CargaAviso, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<number> {
  if (!pushDisponible() || carga.panelId === null) return 0;
  let enviados = 0;
  try {
    const gente = await destinatarios(carga.panelId);
    if (gente.length === 0) return 0;
    const prefs = await db.select().from(preferenciaAviso).where(inArray(preferenciaAviso.usuarioId, gente.map((g) => g.usuarioId)));
    const tokens = await db.select().from(dispositivoPush).where(inArray(dispositivoPush.usuarioId, gente.map((g) => g.usuarioId)));
    const rastro = async (usuarioId: number, resultado: string, dispositivoId: number | null = null, detalle: string | null = null): Promise<number | null> => {
      const [f] = await db
        .insert(envioPush)
        .values({ eventoId: carga.eventoId, usuarioId, dispositivoId, resultado, detalle })
        .returning({ id: envioPush.id })
        .catch(() => [] as { id: number }[]);
      return f?.id ?? null;
    };
    /*
     * Red de seguridad: si en 30 s el teléfono no acusó el mensaje de datos,
     * se reenvía como notificación simple del sistema, que llega aunque la
     * app esté muerta. Sin voz, pero llega: lo que no puede pasar es que un
     * aviso se pierda.
     */
    const reenviarSiNoAcusa = (envioId: number, token: string, mensaje: MensajePush) => {
      setTimeout(async () => {
        try {
          const [f] = await db.select({ recibidoEn: envioPush.recibidoEn }).from(envioPush).where(eq(envioPush.id, envioId)).limit(1);
          if (!f || f.recibidoEn) return;
          const r = await enviarPushSimple(token, mensaje);
          await db.update(envioPush).set({ detalle: `sin acuse en 30 s; reenviado como notificación simple (${r})` }).where(eq(envioPush.id, envioId));
          log.info({ envioId, r }, 'Push reenviado como notificación simple');
        } catch (err) {
          log.warn({ err: (err as Error).message, envioId }, 'No se pudo reenviar el push');
        }
      }, 30_000).unref();
    };
    for (const g of gente) {
      const frase = fraseParaEvento(carga, { nombrarSitio: g.sitios > 1 });
      if (!frase) continue;
      const datos = { eventoId: String(carga.eventoId), panelId: String(carga.panelId ?? ''), categoria: carga.categoria ?? '' };
      const mensaje: MensajePush = { titulo: frase.titulo, cuerpo: frase.cuerpo, habla: frase.texto, canal: frase.canal, datos };
      const guardadas = prefs.find((x) => x.usuarioId === g.usuarioId);
      const p: PreferenciasAviso = guardadas ? { ...guardadas, vozPush: guardadas.vozPush as VozPush } : PREFERENCIAS_POR_DEFECTO;
      if (!quiereRecibirAhora(p, frase.grupo)) {
        await rastro(g.usuarioId, 'omitido', null, 'apagado en sus preferencias o en silencio');
        continue;
      }
      const paraEste = conVoz(p, mensaje.canal) ? mensaje : { ...mensaje, habla: '' };
      const suyos = tokens.filter((x) => x.usuarioId === g.usuarioId);
      if (suyos.length === 0) {
        await rastro(g.usuarioId, 'sin-telefono');
        continue;
      }
      for (const t of suyos) {
        try {
          const r = await enviarPush(t.token, paraEste, g.usuarioId);
          if (r === 'enviado') enviados++;
          if (r === 'token-invalido') await db.delete(dispositivoPush).where(eq(dispositivoPush.id, t.id));
          const envioId = await rastro(g.usuarioId, r, t.id, paraEste.habla ? null : 'sin voz por preferencia');
          if (r === 'enviado' && envioId) reenviarSiNoAcusa(envioId, t.token, paraEste);
        } catch (err) {
          log.warn({ err: (err as Error).message, usuarioId: g.usuarioId }, 'No se pudo mandar el push');
          await rastro(g.usuarioId, 'error', t.id, (err as Error).message.slice(0, 200));
        }
      }
    }
    if (enviados) log.info({ eventoId: carga.eventoId, enviados }, 'Avisos push enviados');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Fallo general del push');
  }
  return enviados;
}
