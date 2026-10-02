import { afterEach, describe, expect, it, vi } from 'vitest';
import { postConReintento } from './fcm.js';

/**
 * Reintentos hacia FCM. La regla, traída de TrueTracker: los fallos de red y
 * lo que FCM marca como transitorio (429, 5xx) se reintentan; un 4xx real no,
 * porque no mejora reintentando. Sin esto, un corte de un segundo hacia Google
 * perdía el aviso de una alarma.
 */

const SIN_ESPERA = [0, 0];
const respuesta = (estado: number, cuerpo = '{}') => new Response(cuerpo, { status: estado });

afterEach(() => vi.unstubAllGlobals());

function simular(...pasos: Array<Response | Error>) {
  const fetch = vi.fn();
  for (const paso of pasos) {
    if (paso instanceof Error) fetch.mockRejectedValueOnce(paso);
    else fetch.mockResolvedValueOnce(paso);
  }
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('postConReintento', () => {
  it('si la red falla dos veces y a la tercera sale, el aviso llega', async () => {
    const fetch = simular(new Error('ETIMEDOUT'), new Error('ECONNRESET'), respuesta(200));
    const r = await postConReintento('https://fcm', 'acceso', {}, SIN_ESPERA);
    expect(r.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('un 503 o un 429 de FCM se reintenta: es FCM diciendo "más tarde"', async () => {
    const fetch = simular(respuesta(503), respuesta(429), respuesta(200));
    expect((await postConReintento('https://fcm', 'acceso', {}, SIN_ESPERA)).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('un token muerto (404) no se reintenta: no va a mejorar', async () => {
    const fetch = simular(respuesta(404, '{"error":{"status":"UNREGISTERED"}}'));
    expect((await postConReintento('https://fcm', 'acceso', {}, SIN_ESPERA)).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('un mensaje inválido (400) tampoco', async () => {
    const fetch = simular(respuesta(400, '{"error":{"status":"INVALID_ARGUMENT"}}'));
    expect((await postConReintento('https://fcm', 'acceso', {}, SIN_ESPERA)).status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('si se agotan los intentos, lanza: quien llama lo anota y arma la red de seguridad', async () => {
    const fetch = simular(new Error('ETIMEDOUT'), new Error('ETIMEDOUT'), respuesta(502));
    await expect(postConReintento('https://fcm', 'acceso', {}, SIN_ESPERA)).rejects.toThrow(/tras 3 intentos: HTTP 502/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('cada intento lleva su propio límite de tiempo, para que una conexión colgada no espere para siempre', async () => {
    const fetch = simular(respuesta(200));
    await postConReintento('https://fcm', 'acceso', {}, SIN_ESPERA);
    expect(fetch.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });
});
