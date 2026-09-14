import type { AccionComando, EstadoParticion, ProveedorControl, ResultadoComando } from './proveedor.js';

/**
 * Control de paneles Hikvision por la OpenAPI de Hik-Partner Pro.
 *
 * Todo lo de abajo está VERIFICADO contra el servicio real el 13 de septiembre
 * de 2026, con la guía oficial (UD36994B, V2.0) a la vista:
 *
 *  - El token se pide a `api.hik-partner.com` y se envía como
 *    `authorization: Bearer <token>`. No hace falta firmar nada.
 *  - La respuesta del token trae `areaDomain`, y las llamadas siguientes van a
 *    ese dominio regional. Usar el de origen da 404.
 *  - El vencimiento es `expireTime`, una marca absoluta en milisegundos; el
 *    token dura 7 días.
 *  - NO existe un endpoint propio de armado en la OpenAPI. El control pasa por
 *    el "paso transparente" a ISAPI: la nube reenvía al panel la misma URI que
 *    se le mandaría en la red local, con el serial en la cabecera X-Devserial.
 *    Por eso cualquier ruta inventada bajo /alarm o /device daba 404.
 *
 * Con la ruta transparente, la respuesta tiene dos capas: la de la pasarela
 * (cabeceras X-EZO-Code, X-ErrorCode, X-DeviceCode) y la del panel (un
 * JSON_ResponseStatus con statusCode 1 cuando salió bien).
 */

const BASE_TOKEN = process.env.HIK_OPENAPI_BASE ?? 'https://api.hik-partner.com';
const RUTA_TOKEN = '/api/hpcgw/v1/token/get';
/** Prefijo del paso transparente: lo que sigue es una URI ISAPI tal cual */
const TRANSPARENTE = '/api/hpcgw/v1/device/transparent';

/** Modo de armado que espera el panel para cada acción nuestra. */
const MODO: Record<Exclude<AccionComando, 'desarmar'>, string> = {
  armar: 'away',
  armar_casa: 'stay',
};

/** URI ISAPI de cada acción. La partición empieza en 1. */
export function uriControl(accion: AccionComando, particion: number): string {
  if (accion === 'desarmar') return `/ISAPI/SecurityCP/control/disarm/${particion}?format=json`;
  return `/ISAPI/SecurityCP/control/arm/${particion}?ways=${MODO[accion]}&format=json`;
}

const URI_ESTADO = '/ISAPI/SecurityCP/status/subSystems?format=json';

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

/**
 * Interpreta la respuesta de una orden por el paso transparente.
 *
 * Hay tres formas de fallar y una de acertar:
 *  - la pasarela rechaza (JSON con errorCode "LAPxxxxxx", o HTTP no 2xx),
 *  - el panel rechaza (JSON_ResponseStatus con statusCode distinto de 1),
 *  - el cuerpo no es JSON,
 *  - o el panel contesta statusCode 1 (a veces 0), que es "hecho".
 */
export function interpretarRespuestaControl(entrada: {
  status: number;
  cuerpo: string;
  codigoDispositivo?: string | null;
}): ResultadoComando {
  let json: {
    errorCode?: string | number;
    message?: string;
    statusCode?: number;
    statusString?: string;
    subStatusCode?: string;
    errorMsg?: string;
    error?: string;
  };
  try {
    json = JSON.parse(entrada.cuerpo);
  } catch {
    return { aceptado: false, detalle: `Respuesta ilegible del proveedor (${entrada.status})` };
  }
  // Rechazo de la pasarela: sus códigos son cadenas "LAP..." o "EVZ..."
  if (typeof json.errorCode === 'string' && json.errorCode !== '0') {
    return { aceptado: false, detalle: json.message ?? `Error ${json.errorCode}` };
  }
  // Respuesta del panel
  if (typeof json.statusCode === 'number') {
    if (json.statusCode === 1 || json.statusCode === 0) return { aceptado: true };
    const motivo = json.errorMsg ?? json.subStatusCode ?? json.statusString ?? `código ${json.statusCode}`;
    return { aceptado: false, detalle: `El panel rechazó la orden: ${motivo}` };
  }
  if (entrada.status < 200 || entrada.status >= 300) {
    return { aceptado: false, detalle: json.error ?? `El proveedor respondió ${entrada.status}` };
  }
  return { aceptado: true };
}

/** Traduce la lista de particiones del panel a nuestro modelo. */
export function interpretarEstado(cuerpo: unknown): EstadoParticion[] {
  const lista = (cuerpo as { SubSysList?: { SubSys?: Record<string, unknown> }[] })?.SubSysList ?? [];
  const estados: EstadoParticion[] = [];
  for (const { SubSys: s } of lista) {
    if (!s || typeof s.id !== 'number') continue;
    const arming = String(s.arming ?? '');
    estados.push({
      particion: s.id,
      nombre: typeof s.name === 'string' ? s.name : undefined,
      habilitada: s.enabled !== false,
      estado: arming === 'away' ? 'armado' : arming === 'stay' ? 'armado_casa' : arming === 'arming' ? 'armando' : 'desarmado',
      enAlarma: s.alarm === true,
    });
  }
  return estados;
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
        const respuesta = await fetch(s.base + TRANSPARENTE + uriControl(accion, Number(particion) || 1), {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${s.token}`,
            'X-Devserial': serial,
          },
          // JSON_Operate: todo opcional, se manda vacío
          body: '{}',
        });
        return interpretarRespuestaControl({
          status: respuesta.status,
          cuerpo: await respuesta.text(),
          codigoDispositivo: respuesta.headers.get('x-devicecode'),
        });
      } catch (err) {
        // Una nube caída no puede tumbar nuestra API: se informa y queda registrado
        return { aceptado: false, detalle: err instanceof Error ? err.message : 'Error desconocido' };
      }
    },

    async consultarEstado(serial): Promise<EstadoParticion[]> {
      const cred = leerCredenciales();
      if (!cred) throw new Error('Falta configurar las credenciales de la OpenAPI de Hikvision');
      const s = await obtenerSesion(cred);
      const respuesta = await fetch(s.base + TRANSPARENTE + URI_ESTADO, {
        method: 'GET',
        headers: { authorization: `Bearer ${s.token}`, 'X-Devserial': serial },
      });
      const texto = await respuesta.text();
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new Error(`Respuesta ilegible del proveedor (${respuesta.status})`);
      }
      const e = json as { errorCode?: string; message?: string };
      if (typeof e.errorCode === 'string' && e.errorCode !== '0') throw new Error(e.message ?? `Error ${e.errorCode}`);
      return interpretarEstado(json);
    },
  };
}
