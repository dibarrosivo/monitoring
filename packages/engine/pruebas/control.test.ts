import { describe, expect, it } from 'vitest';
import { interpretarRespuestaToken, sesionVigente } from '../src/control/hikvision.js';
import { admiteControl, proveedorPara, registrarProveedor, SIN_CONTROL } from '../src/control/proveedor.js';

/**
 * Lo que se puede probar sin credenciales del fabricante: la selección de
 * proveedor, el comportamiento ante equipos sin control, y la firma.
 * El diálogo con la nube se ejercita cuando tengamos acceso.
 */

describe('qué equipos admiten control', () => {
  it('los equipos sin proveedor no admiten control', () => {
    // PIMA y los transmisores reportan por vías de un solo sentido
    for (const tipo of ['pima', 'ebm', 'otro']) {
      expect(admiteControl(tipo)).toBe(false);
    }
  });

  it('un tipo sin proveedor devuelve el proveedor nulo, no revienta', () => {
    // Deliberado: el resto del sistema no debe preguntar "¿y si no hay?"
    expect(proveedorPara('pima')).toBe(SIN_CONTROL);
  });

  it('el proveedor nulo rechaza con un motivo legible', async () => {
    const r = await SIN_CONTROL.enviar({ serial: 'X', accion: 'armar', particion: '01' });
    expect(r.aceptado).toBe(false);
    expect(r.detalle).toMatch(/no admite control/i);
  });

  it('registrar un proveedor habilita ese tipo', () => {
    registrarProveedor('marca_prueba', () => ({
      nombre: 'prueba',
      async enviar() {
        return { aceptado: true };
      },
    }));
    expect(admiteControl('marca_prueba')).toBe(true);
    expect(proveedorPara('marca_prueba').nombre).toBe('prueba');
  });
});

describe('sesión contra la nube de Hikvision', () => {
  it('usa el dominio regional que devuelve el servicio, no el de origen', () => {
    // Verificado contra el servicio real: pedir el token a api.hik-partner.com
    // devuelve areaDomain, y llamar al de origen da 404.
    const s = interpretarRespuestaToken({
      data: { accessToken: 'hpc.abc', expireTime: 1789653897003, areaDomain: 'https://apiisa.hik-partner.com' },
    });
    expect(s.base).toBe('https://apiisa.hik-partner.com');
    expect(s.token).toBe('hpc.abc');
  });

  it('el vencimiento es una marca absoluta, no una duración', () => {
    const s = interpretarRespuestaToken({ data: { accessToken: 'x', expireTime: 1789653897003 } });
    expect(s.vence).toBe(1789653897003);
  });

  it('sin token, falla con un motivo claro', () => {
    expect(() => interpretarRespuestaToken({ data: {} })).toThrow(/no devolvió un token/i);
    expect(() => interpretarRespuestaToken({})).toThrow();
  });

  it('quita la barra final del dominio para no armar rutas con doble barra', () => {
    const s = interpretarRespuestaToken({ data: { accessToken: 'x', areaDomain: 'https://a.com/' } });
    expect(s.base).toBe('https://a.com');
  });

  it('una sesión vencida o por vencer no se reutiliza', () => {
    const ahora = 1_000_000;
    expect(sesionVigente({ base: 'x', token: 't', vence: ahora + 300_000 }, ahora)).toBe(true);
    expect(sesionVigente({ base: 'x', token: 't', vence: ahora - 1 }, ahora)).toBe(false);
    // Margen: una que vence en 30 segundos podría expirar durante la llamada
    expect(sesionVigente({ base: 'x', token: 't', vence: ahora + 30_000 }, ahora)).toBe(false);
    expect(sesionVigente(null, ahora)).toBe(false);
  });
});
