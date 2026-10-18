// Vigía entre servidores: cada uno mira al otro y avisa por FST Alarma si se cae.
//
// El 18-10-2026 Contabo apagó los dos servidores (TrueTracker a las 08:05 y la
// central a las 08:12) y nadie se enteró: el sistema que avisa vive en el mismo
// servidor que se apagó. Este programa corre en el OTRO servidor, una vez por
// minuto (systemd), sin dependencias: Node 22 alcanza.
//
//   node vigia.mjs /ruta/vigia.env
//
// Si un chequeo falla FALLOS_PARA_AVISAR veces seguidas avisa; mientras siga
// caído recuerda cada RECORDAR_MIN minutos; cuando vuelve avisa cuánto duró.
// Los teléfonos salen de la central (/api/vigia/destinos) y se guardan en el
// estado, porque cuando la caída es de la central no hay a quién preguntarle.
//
// No vigila el caso de que se caigan los dos a la vez: para eso hace falta un
// servicio de afuera de Contabo (UptimeRobot o similar).

import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { connect } from 'node:net';

// ---------- configuración ----------

export function leerConfig(ruta) {
  const env = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const requerido = (k) => {
    if (!env[k]) throw new Error(`Falta ${k} en ${ruta}`);
    return env[k];
  };
  return {
    objetivo: requerido('OBJETIVO'), // "Central FST", "TrueTracker"
    chequeos: requerido('CHEQUEOS').split(',').map((c) => c.trim()).filter(Boolean),
    destinosUrl: requerido('DESTINOS_URL'),
    destinosClave: requerido('DESTINOS_CLAVE'),
    roles: (env.ROLES ?? 'admin,supervisor,operador').split(',').map((r) => r.trim()),
    canal: env.CANAL === 'avisos' ? 'avisos' : 'alarmas',
    credenciales: requerido('FIREBASE_CREDENCIALES'),
    estado: requerido('ESTADO'),
    fallosParaAvisar: Number(env.FALLOS_PARA_AVISAR ?? 3),
    recordarMin: Number(env.RECORDAR_MIN ?? 60),
    refrescarDestinosMin: Number(env.REFRESCAR_DESTINOS_MIN ?? 60),
  };
}

// ---------- chequeos ----------

/** "https://..." espera HTTP 200; "tcp:host:puerto" espera que acepte la conexión. */
export async function chequear(chequeo, limiteMs = 10_000) {
  if (chequeo.startsWith('tcp:')) {
    const [, host, puerto] = chequeo.split(':');
    return new Promise((listo) => {
      const s = connect({ host, port: Number(puerto) });
      const fin = (ok, detalle) => {
        s.destroy();
        listo({ chequeo, ok, detalle });
      };
      s.setTimeout(limiteMs, () => fin(false, 'sin respuesta'));
      s.once('connect', () => fin(true));
      s.once('error', (e) => fin(false, e.code ?? e.message));
    });
  }
  try {
    const r = await fetch(chequeo, { signal: AbortSignal.timeout(limiteMs) });
    return { chequeo, ok: r.status === 200, detalle: r.status === 200 ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { chequeo, ok: false, detalle: e.cause?.code ?? e.name ?? 'error' };
  }
}

// ---------- decisión (pura, para poder probarla) ----------

export function duracion(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/**
 * Dado el estado anterior y el resultado de esta vuelta, el estado nuevo y el
 * aviso a mandar (o null). Avisa al cruzar el umbral, recuerda cada
 * `recordarMin` mientras siga caído, y avisa la vuelta solo si había avisado
 * la caída (un micro corte de un minuto no despierta a nadie, ni a la ida ni a
 * la vuelta).
 */
export function decidir(estado, fallidos, ahora, cfg) {
  const e = { fallos: 0, caidoDesde: null, avisadoEn: null, ...estado };
  if (fallidos.length === 0) {
    const aviso = e.avisadoEn
      ? { tipo: 'vuelta', titulo: 'Servidor restablecido', cuerpo: `${cfg.objetivo} volvió a responder tras ${duracion(ahora - e.caidoDesde)} sin servicio.` }
      : null;
    return { estado: { ...e, fallos: 0, caidoDesde: null, avisadoEn: null }, aviso };
  }
  const caidoDesde = e.caidoDesde ?? ahora;
  // La caída empezó hasta un minuto antes del primer chequeo fallido: tres fallas son «3 min»
  const lleva = duracion(ahora - caidoDesde + 60_000);
  const fallos = e.fallos + 1;
  const que = fallidos.map((f) => `${f.chequeo.replace(/^https?:\/\//, '').replace(/^tcp:/, '')} (${f.detalle ?? 'falla'})`).join(', ');
  let aviso = null;
  let avisadoEn = e.avisadoEn;
  if (fallos >= cfg.fallosParaAvisar && !e.avisadoEn) {
    // El título dice qué pasó; el cuerpo, cuál de los servidores (pedido del dueño, 18-10)
    aviso = { tipo: 'caida', titulo: 'SERVIDOR CAÍDO', cuerpo: `${cfg.objetivo} no responde desde hace ${lleva}: ${que}` };
    avisadoEn = ahora;
  } else if (e.avisadoEn && ahora - e.avisadoEn >= cfg.recordarMin * 60_000) {
    aviso = { tipo: 'recordatorio', titulo: 'SERVIDOR SIGUE CAÍDO', cuerpo: `${cfg.objetivo} lleva ${lleva} sin responder: ${que}` };
    avisadoEn = ahora;
  }
  return { estado: { ...e, fallos, caidoDesde, avisadoEn }, aviso };
}

// ---------- push por FCM (misma app y canales que la central) ----------

const CANAL_PUSH = { alarmas: 'alarmas-v2', avisos: 'avisos-v2' };

async function tokenDeAcceso(c) {
  const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const sinFirma = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: c.token_uri, iat: ahora, exp: ahora + 3600 })}`;
  const jwt = `${sinFirma}.${createSign('RSA-SHA256').update(sinFirma).sign(c.private_key, 'base64url')}`;
  const r = await fetch(c.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`token de Google: HTTP ${r.status}`);
  return (await r.json()).access_token;
}

/**
 * Dos mensajes por teléfono, con la misma etiqueta: uno de datos (lo arma la
 * app, con voz y sirena) y uno de notificación (lo muestra Android aunque la
 * app esté muerta). Si llegan los dos, Android deja uno solo.
 */
async function avisar(cfg, destinos, aviso, etiqueta) {
  const c = JSON.parse(readFileSync(cfg.credenciales, 'utf8'));
  const acceso = await tokenDeAcceso(c);
  const url = `https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`;
  const canal = aviso.tipo === 'vuelta' ? 'avisos' : cfg.canal;
  const datos = { eventoId: etiqueta, titulo: aviso.titulo, cuerpo: aviso.cuerpo, habla: `${aviso.titulo}. ${aviso.cuerpo}`, canal, origen: 'vigia' };
  let enviados = 0;
  for (const d of destinos) {
    for (const message of [
      { token: d.token, data: datos, android: { priority: 'high', ttl: '3600s' } },
      {
        token: d.token,
        notification: { title: aviso.titulo, body: aviso.cuerpo },
        data: { eventoId: etiqueta, reenvio: '1', origen: 'vigia' },
        android: {
          priority: 'high',
          notification: {
            tag: `evento-${etiqueta}`,
            channel_id: CANAL_PUSH[canal],
            sound: canal === 'alarmas' ? 'sirena.wav' : 'default',
            notification_priority: canal === 'alarmas' ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
          },
        },
      },
    ]) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${acceso}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(15_000),
        });
        if (r.ok) enviados++;
        else console.log(`FCM ${r.status} para ${d.nombre}: ${(await r.text()).slice(0, 120)}`);
      } catch (e) {
        console.log(`FCM sin respuesta para ${d.nombre}: ${e.message}`);
      }
    }
  }
  return enviados;
}

// ---------- vuelta principal ----------

function leerEstado(ruta) {
  try {
    return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : {};
  } catch {
    return {};
  }
}

function guardarEstado(ruta, estado) {
  writeFileSync(`${ruta}.tmp`, JSON.stringify(estado, null, 2));
  renameSync(`${ruta}.tmp`, ruta);
}

async function refrescarDestinos(cfg, estado, ahora) {
  if (estado.destinosEn && ahora - estado.destinosEn < cfg.refrescarDestinosMin * 60_000) return;
  try {
    const r = await fetch(cfg.destinosUrl, { headers: { 'x-vigia-clave': cfg.destinosClave }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { destinos } = await r.json();
    estado.destinos = destinos.filter((d) => cfg.roles.includes(d.rol));
    estado.destinosEn = ahora;
  } catch (e) {
    // Se sigue con la lista guardada: si la central está caída, es la que sirve
    console.log(`No se pudo refrescar la lista de teléfonos (${e.message}); uso la guardada (${estado.destinos?.length ?? 0})`);
  }
}

async function principal() {
  const cfg = leerConfig(process.argv[2] ?? '/vigia/vigia.env');
  const ahora = Date.now();
  const anterior = leerEstado(cfg.estado);
  const resultados = await Promise.all(cfg.chequeos.map((c) => chequear(c)));
  const fallidos = resultados.filter((r) => !r.ok);
  const { estado, aviso } = decidir(anterior, fallidos, ahora, cfg);
  estado.destinos = anterior.destinos;
  estado.destinosEn = anterior.destinosEn;
  await refrescarDestinos(cfg, estado, ahora);
  estado.ultimaVuelta = new Date(ahora).toISOString();
  estado.ultimoResultado = resultados;
  if (aviso) {
    const etiqueta = `vigia-${cfg.objetivo.replace(/\W+/g, '').toLowerCase()}-${estado.caidoDesde ?? anterior.caidoDesde ?? ahora}`;
    const destinos = estado.destinos ?? [];
    const enviados = destinos.length ? await avisar(cfg, destinos, aviso, etiqueta) : 0;
    console.log(`${aviso.titulo} — ${aviso.cuerpo} → ${enviados} mensajes a ${destinos.length} teléfonos`);
  } else if (fallidos.length) {
    console.log(`Falla ${estado.fallos}/${cfg.fallosParaAvisar}: ${fallidos.map((f) => `${f.chequeo} (${f.detalle})`).join(', ')}`);
  }
  guardarEstado(cfg.estado, estado);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => {
    console.error(`vigía: ${e.message}`);
    process.exit(1);
  });
}
