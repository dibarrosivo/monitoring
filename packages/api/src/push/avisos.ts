import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { acceso, cliente, db, dispositivoPush, panel, preferenciaAviso, sitio, usuario } from '@monitoring/db';
import type { CategoriaEvento } from '@monitoring/shared';
import { enviarPush, pushDisponible, type MensajePush } from './fcm.js';

/**
 * Avisos push a los teléfonos: para cada evento, a quién le toca (los
 * accesos que alcanzan ese panel), qué quiere recibir (sus preferencias) y
 * qué se le dice. Es el mismo criterio que la app aplica cuando está
 * abierta; acá se aplica cuando está cerrada.
 */

export interface CargaEvento {
  eventoId: number;
  panelId: number | null;
  categoria?: CategoriaEvento;
  codigo?: string;
  descripcion: string;
  prioridad: number;
  zona?: string | null;
  zonaDescripcion?: string | null;
  sitioNombre?: string | null;
}

interface Preferencias {
  armadoDesarmado: boolean;
  averias: boolean;
  sistema: boolean;
  silencioDesde: string | null;
  silencioHasta: string | null;
  vozPush?: string;
}
const POR_DEFECTO: Preferencias = { armadoDesarmado: true, averias: true, sistema: true, silencioDesde: null, silencioHasta: null, vozPush: 'siempre' };

/** ¿Este aviso se dice en voz alta en el teléfono? La notificación llega igual. */
export function conVoz(prefs: Preferencias, canal: 'alarmas' | 'avisos'): boolean {
  const v = prefs.vozPush ?? 'siempre';
  return v === 'siempre' || (v === 'solo_alarmas' && canal === 'alarmas');
}

const EMERGENCIAS: Record<string, string> = {
  '100': 'emergencia médica',
  '101': 'emergencia personal',
  '110': 'incendio',
  '111': 'humo',
  '115': 'pulsador de incendio',
  '120': 'pánico',
  '121': 'coacción',
  '122': 'pánico silencioso',
  '123': 'pánico',
  '151': 'gas',
  '162': 'monóxido de carbono',
};

function persona(descripcion: string): string | null {
  const m = / — (.+?) \(cód\. \d+\)$/.exec(descripcion);
  return m ? m[1]! : null;
}
function sinPrefijo(d: string): string {
  return d.replace(/^[^:]{1,30}:\s*/, '');
}

/** Título, cuerpo y canal del aviso, o null si no se avisa (pruebas, latidos). */
export function mensajeParaEvento(carga: CargaEvento, nombrarSitio: boolean): (MensajePush & { grupo: keyof Preferencias | null }) | null {
  const cat = carga.categoria;
  if (!cat || cat === 'prueba' || (carga.codigo ?? '').startsWith('PIMA-0')) return null;
  const lugar = nombrarSitio && carga.sitioNombre ? ` en ${carga.sitioNombre}` : '';
  const zona = carga.zona && Number(carga.zona) > 0 ? ` en zona ${Number(carga.zona)}${carga.zonaDescripcion ? `, ${carga.zonaDescripcion}` : ''}` : '';
  const datos = { eventoId: String(carga.eventoId), panelId: String(carga.panelId ?? ''), categoria: cat };
  switch (cat) {
    case 'alarma': {
      const cid = /^[ER](\d{3})$/.exec(carga.codigo ?? '')?.[1] ?? '';
      if (EMERGENCIAS[cid] || carga.prioridad <= 1) {
        const que = `${EMERGENCIAS[cid] ?? sinPrefijo(carga.descripcion)}${lugar}`;
        return { titulo: 'EMERGENCIA', cuerpo: que, habla: `Emergencia: ${que}`, canal: 'alarmas', datos, grupo: null };
      }
      const que = `Alarma${zona}${lugar}${zona ? '' : `: ${sinPrefijo(carga.descripcion)}`}`;
      return { titulo: 'ALARMA', cuerpo: que, habla: que, canal: 'alarmas', datos, grupo: null };
    }
    case 'cierre': {
      const quien = persona(carga.descripcion);
      const que = `${carga.codigo === 'R441' ? 'Sistema armado en casa' : 'Sistema armado'}${lugar}${quien ? ` por ${quien}` : ''}`;
      return { titulo: 'Sistema armado', cuerpo: que.replace(/^Sistema armado( en casa)?/, (m) => m.replace('Sistema a', 'A')), habla: que, canal: 'avisos', datos, grupo: 'armadoDesarmado' };
    }
    case 'apertura': {
      const quien = persona(carga.descripcion);
      const que = `Sistema desarmado${lugar}${quien ? ` por ${quien}` : ''}`;
      return { titulo: 'Sistema desarmado', cuerpo: que.replace(/^Sistema d/, 'D'), habla: que, canal: 'avisos', datos, grupo: 'armadoDesarmado' };
    }
    case 'cancelacion':
      return { titulo: 'Alarma cancelada', cuerpo: `Alarma cancelada${lugar}`, habla: `Alarma cancelada${lugar}`, canal: 'avisos', datos, grupo: 'armadoDesarmado' };
    case 'restauracion': {
      const que = `${sinPrefijo(carga.descripcion)}${zona}${lugar}`;
      return { titulo: 'Restablecido', cuerpo: que, habla: `Restablecido: ${que}`, canal: 'avisos', datos, grupo: 'averias' };
    }
    case 'averia':
    case 'anulacion': {
      const que = `${carga.descripcion}${zona}${lugar}`;
      return { titulo: 'Aviso', cuerpo: que, habla: `Aviso: ${que}`, canal: 'avisos', datos, grupo: 'averias' };
    }
    default: {
      const que = `${carga.descripcion}${lugar}`;
      return { titulo: 'Aviso de la central', cuerpo: que, habla: `Aviso de la central: ${que}`, canal: carga.prioridad <= 1 ? 'alarmas' : 'avisos', datos, grupo: carga.prioridad <= 1 ? null : 'sistema' };
    }
  }
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Igual que en la app: emergencias y alarmas siempre; el resto según preferencias y franja de silencio (hora de la central). */
export function quiereRecibir(prefs: Preferencias, grupo: keyof Preferencias | null, ahora: Date = new Date()): boolean {
  if (grupo === null) return true;
  if (!prefs[grupo]) return false;
  if (!prefs.silencioDesde || !prefs.silencioHasta) return true;
  const local = new Date(ahora.toLocaleString('en-US', { timeZone: process.env.ZONA_HORARIA_CENTRAL ?? 'America/Caracas' }));
  const m = local.getHours() * 60 + local.getMinutes();
  const desde = minutos(prefs.silencioDesde);
  const hasta = minutos(prefs.silencioHasta);
  const enSilencio = desde <= hasta ? m >= desde && m < hasta : m >= desde || m < hasta;
  return !enSilencio;
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
export async function enviarAvisosPush(carga: CargaEvento, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<number> {
  if (!pushDisponible() || carga.panelId === null) return 0;
  let enviados = 0;
  try {
    const gente = await destinatarios(carga.panelId);
    if (gente.length === 0) return 0;
    const prefs = await db.select().from(preferenciaAviso).where(inArray(preferenciaAviso.usuarioId, gente.map((g) => g.usuarioId)));
    const tokens = await db.select().from(dispositivoPush).where(inArray(dispositivoPush.usuarioId, gente.map((g) => g.usuarioId)));
    for (const g of gente) {
      const mensaje = mensajeParaEvento(carga, g.sitios > 1);
      if (!mensaje) continue;
      const p = prefs.find((x) => x.usuarioId === g.usuarioId) ?? POR_DEFECTO;
      if (!quiereRecibir(p, mensaje.grupo)) continue;
      const paraEste = conVoz(p, mensaje.canal) ? mensaje : { ...mensaje, habla: '' };
      for (const t of tokens.filter((x) => x.usuarioId === g.usuarioId)) {
        try {
          const r = await enviarPush(t.token, paraEste, g.usuarioId);
          if (r === 'enviado') enviados++;
          if (r === 'token-invalido') await db.delete(dispositivoPush).where(eq(dispositivoPush.id, t.id));
        } catch (err) {
          log.warn({ err: (err as Error).message, usuarioId: g.usuarioId }, 'No se pudo mandar el push');
        }
      }
    }
    if (enviados) log.info({ eventoId: carga.eventoId, enviados }, 'Avisos push enviados');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Fallo general del push');
  }
  return enviados;
}
