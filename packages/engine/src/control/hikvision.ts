import { createHmac } from 'node:crypto';
import type { AccionComando, ProveedorControl, ResultadoComando } from './proveedor.js';

/**
 * Control de paneles Hikvision a través de la nube del fabricante
 * (OpenAPI de Hik-Partner Pro).
 *
 * ATENCIÓN: esta es la única pieza del control que NO está verificada contra el
 * servicio real, porque a la fecha no tenemos credenciales. Las rutas y el
 * armado de la firma salen de la documentación pública. Todo lo demás del
 * sistema de comandos sí está probado, y se apoya en la interfaz
 * ProveedorControl, así que corregir lo de aquí abajo no toca nada más.
 *
 * Requisitos conocidos:
 *  - El panel debe estar dado de alta en la cuenta de Hik-Partner Pro.
 *  - Los permisos de operación exigen AX Pro V1.2.7 o superior.
 */

const BASE = process.env.HIK_OPENAPI_BASE ?? 'https://api.hik-partner.com';

/** Rutas del fabricante, agrupadas para que corregirlas sea un solo lugar. */
const RUTAS = {
  token: '/api/hpcgw/v1/token/get',
  armar: '/api/hpcgw/v1/alarm/arm',
  desarmar: '/api/hpcgw/v1/alarm/disarm',
} as const;

/** Modo de armado que espera el fabricante para cada acción nuestra. */
const MODO: Record<AccionComando, string> = {
  armar: 'away',
  armar_casa: 'stay',
  desarmar: '',
};

interface Credenciales {
  clave: string;
  secreto: string;
}

export function leerCredenciales(): Credenciales | null {
  const clave = (process.env.HIK_OPENAPI_CLAVE ?? '').trim();
  const secreto = (process.env.HIK_OPENAPI_SECRETO ?? '').trim();
  return clave && secreto ? { clave, secreto } : null;
}

/**
 * Firma de la petición: HMAC-SHA256 sobre el método y la ruta, en base64.
 * Se expone aparte para poder probarla sin llamar a la nube.
 */
export function firmar(entrada: { metodo: string; ruta: string; secreto: string }): string {
  const cadena = `${entrada.metodo.toUpperCase()}\n${entrada.ruta}`;
  return createHmac('sha256', entrada.secreto).update(cadena, 'utf8').digest('base64');
}

/** Token con caché: pedir uno por comando sería lento y abusivo con el servicio. */
let tokenCache: { valor: string; vence: number } | null = null;

async function obtenerToken(cred: Credenciales, ahora = Date.now()): Promise<string> {
  if (tokenCache && tokenCache.vence > ahora + 30_000) return tokenCache.valor;
  const respuesta = await fetch(BASE + RUTAS.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appKey: cred.clave, secretKey: cred.secreto }),
  });
  if (!respuesta.ok) throw new Error(`El proveedor rechazó la solicitud de token (${respuesta.status})`);
  const cuerpo = (await respuesta.json()) as { data?: { accessToken?: string; expiresIn?: number } };
  const valor = cuerpo.data?.accessToken;
  if (!valor) throw new Error('El proveedor no devolvió un token');
  // Se descuenta un margen para no usar un token que vence entre medio
  tokenCache = { valor, vence: ahora + (cuerpo.data?.expiresIn ?? 3600) * 1000 };
  return valor;
}

/** Solo para las pruebas: vacía el token guardado. */
export function olvidarToken(): void {
  tokenCache = null;
}

export function crearProveedorHikvision(): ProveedorControl {
  return {
    nombre: 'hik-partner-pro',
    async enviar({ serial, accion, particion }): Promise<ResultadoComando> {
      const cred = leerCredenciales();
      if (!cred) {
        return { aceptado: false, detalle: 'Falta configurar las credenciales de la OpenAPI de Hikvision' };
      }
      const ruta = accion === 'desarmar' ? RUTAS.desarmar : RUTAS.armar;
      try {
        const token = await obtenerToken(cred);
        const respuesta = await fetch(BASE + ruta, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-CA-Key': cred.clave,
            'X-CA-Signature': firmar({ metodo: 'POST', ruta, secreto: cred.secreto }),
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            deviceSerial: serial,
            subSystemNo: Number(particion) || 1,
            ...(accion === 'desarmar' ? {} : { armMode: MODO[accion] }),
          }),
        });
        if (!respuesta.ok) {
          return { aceptado: false, detalle: `El proveedor respondió ${respuesta.status}` };
        }
        const cuerpo = (await respuesta.json()) as { errorCode?: string; errorMsg?: string };
        if (cuerpo.errorCode && cuerpo.errorCode !== '0') {
          return { aceptado: false, detalle: cuerpo.errorMsg ?? `Error ${cuerpo.errorCode}` };
        }
        return { aceptado: true };
      } catch (err) {
        // Una nube caída no puede tumbar nuestra API: se informa y queda registrado
        return { aceptado: false, detalle: err instanceof Error ? err.message : 'Error desconocido' };
      }
    },
  };
}
