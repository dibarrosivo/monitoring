import type { AccionComando, ProveedorControl, ResultadoComando } from './proveedor.js';

/**
 * Control de paneles Hikvision por la OpenAPI de Hik-Partner Pro.
 *
 * Lo VERIFICADO contra el servicio real el 13 de septiembre de 2026:
 *
 *  - El token se pide a `api.hik-partner.com` y se envía como
 *    `authorization: Bearer <token>`. NO hace falta firmar nada: la
 *    documentación menciona una cabecera X-CA-Signature con HMAC, pero el
 *    servicio acepta el token puro y rechaza las demás variantes.
 *  - La respuesta del token trae `areaDomain`, y **las llamadas siguientes van
 *    a ese dominio regional**, no al de origen. Usar el de origen da 404.
 *  - El vencimiento viene como `expireTime`, una marca de tiempo absoluta en
 *    milisegundos, no como una duración.
 *
 * Lo NO verificado: las rutas de armado y desarmado. Las de abajo devuelven
 * 404, así que son un marcador de posición hasta tener la guía del fabricante,
 * que se descarga desde el portal de Hik-Partner Pro. Mientras tanto el
 * proveedor informa el fallo con su motivo y todo queda registrado.
 */

const BASE_TOKEN = process.env.HIK_OPENAPI_BASE ?? 'https://api.hik-partner.com';
const RUTA_TOKEN = '/api/hpcgw/v1/token/get';

/**
 * Rutas de control. SIN CONFIRMAR: el servicio responde 404 a todas.
 * Al corregirlas con la guía oficial no hay que tocar nada más de este archivo.
 */
const RUTAS = {
  armar: process.env.HIK_RUTA_ARMAR ?? '/api/hpcgw/v1/alarm/arm',
  desarmar: process.env.HIK_RUTA_DESARMAR ?? '/api/hpcgw/v1/alarm/disarm',
} as const;

/** Modo de armado que espera el fabricante para cada acción nuestra. */
const MODO: Record<AccionComando, string> = {
  armar: 'away',
  armar_casa: 'stay',
  desarmar: '',
};

export interface Sesion {
  /** Dominio regional que indicó el servicio; NO es el de la petición del token */
  base: string;
  token: string;
  /** Marca de tiempo absoluta en milisegundos */
  vence: number;
}

export function leerCredenciales(): { clave: string; secreto: string } | null {
  const clave = (process.env.HIK_OPENAPI_CLAVE ?? '').trim();
  const secreto = (process.env.HIK_OPENAPI_SECRETO ?? '').trim();
  return clave && secreto ? { clave, secreto } : null;
}

/** Interpreta la respuesta del token. Aparte para poder probarla sin red. */
export function interpretarRespuestaToken(cuerpo: unknown): Sesion {
  const d = (cuerpo as { data?: { accessToken?: string; expireTime?: number; areaDomain?: string } })?.data;
  if (!d?.accessToken) throw new Error('El proveedor no devolvió un token');
  return {
    token: d.accessToken,
    // Sin areaDomain se cae al dominio de origen, aunque en la práctica siempre viene
    base: (d.areaDomain ?? BASE_TOKEN).replace(/\/+$/, ''),
    vence: d.expireTime ?? Date.now() + 3_600_000,
  };
}

/** ¿Sigue sirviendo? Se descuenta un margen para no usar una que venza entre medio. */
export function sesionVigente(s: Sesion | null, ahora = Date.now()): boolean {
  return Boolean(s && s.vence > ahora + 60_000);
}

let sesion: Sesion | null = null;

/** Solo para las pruebas: olvida la sesión guardada. */
export function olvidarSesion(): void {
  sesion = null;
}

async function obtenerSesion(cred: { clave: string; secreto: string }): Promise<Sesion> {
  if (sesionVigente(sesion)) return sesion!;
  const respuesta = await fetch(BASE_TOKEN + RUTA_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appKey: cred.clave, secretKey: cred.secreto }),
  });
  if (!respuesta.ok) throw new Error(`El proveedor rechazó la solicitud de token (${respuesta.status})`);
  sesion = interpretarRespuestaToken(await respuesta.json());
  return sesion;
}

export function crearProveedorHikvision(): ProveedorControl {
  return {
    nombre: 'hik-partner-pro',
    async enviar({ serial, accion, particion }): Promise<ResultadoComando> {
      const cred = leerCredenciales();
      if (!cred) {
        return { aceptado: false, detalle: 'Falta configurar las credenciales de la OpenAPI de Hikvision' };
      }
      try {
        const s = await obtenerSesion(cred);
        const ruta = accion === 'desarmar' ? RUTAS.desarmar : RUTAS.armar;
        const respuesta = await fetch(s.base + ruta, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
          body: JSON.stringify({
            deviceSerial: serial,
            subSystemNo: Number(particion) || 1,
            ...(accion === 'desarmar' ? {} : { armMode: MODO[accion] }),
          }),
        });
        const texto = await respuesta.text();
        let cuerpo: { errorCode?: string; message?: string; error?: string } = {};
        try {
          cuerpo = JSON.parse(texto);
        } catch {
          return { aceptado: false, detalle: `Respuesta ilegible del proveedor (${respuesta.status})` };
        }
        // El servicio devuelve 200 con errorCode incluso cuando falla
        if (cuerpo.errorCode && cuerpo.errorCode !== '0') {
          return { aceptado: false, detalle: cuerpo.message ?? `Error ${cuerpo.errorCode}` };
        }
        if (!respuesta.ok) {
          return { aceptado: false, detalle: cuerpo.error ?? `El proveedor respondió ${respuesta.status}` };
        }
        return { aceptado: true };
      } catch (err) {
        // Una nube caída no puede tumbar nuestra API: se informa y queda registrado
        return { aceptado: false, detalle: err instanceof Error ? err.message : 'Error desconocido' };
      }
    },
  };
}
