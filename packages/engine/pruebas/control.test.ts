import { describe, expect, it } from 'vitest';
import { firmar } from '../src/control/hikvision.js';
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

describe('firma de las peticiones a Hikvision', () => {
  it('es estable para la misma entrada', () => {
    const a = firmar({ metodo: 'POST', ruta: '/api/hpcgw/v1/alarm/arm', secreto: 'secreto' });
    const b = firmar({ metodo: 'POST', ruta: '/api/hpcgw/v1/alarm/arm', secreto: 'secreto' });
    expect(a).toBe(b);
  });

  it('cambia si cambia la ruta, el método o el secreto', () => {
    const base = firmar({ metodo: 'POST', ruta: '/a', secreto: 's' });
    expect(firmar({ metodo: 'POST', ruta: '/b', secreto: 's' })).not.toBe(base);
    expect(firmar({ metodo: 'GET', ruta: '/a', secreto: 's' })).not.toBe(base);
    expect(firmar({ metodo: 'POST', ruta: '/a', secreto: 'otro' })).not.toBe(base);
  });

  it('el método no distingue mayúsculas', () => {
    expect(firmar({ metodo: 'post', ruta: '/a', secreto: 's' })).toBe(
      firmar({ metodo: 'POST', ruta: '/a', secreto: 's' }),
    );
  });

  it('produce base64, no hexadecimal', () => {
    const f = firmar({ metodo: 'POST', ruta: '/a', secreto: 's' });
    expect(f).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(f).not.toMatch(/^[0-9a-f]{64}$/);
  });
});
