import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretoSesiones } from './secretos.js';

/**
 * En producción, sin secreto de sesiones no se arranca. Antes caía a
 * 'solo-desarrollo', que está escrito en el repositorio: con eso cualquiera
 * podía fabricarse una sesión de administrador.
 */
afterEach(() => vi.unstubAllEnvs());

describe('secretoSesiones', () => {
  it('en producción, sin secreto, se niega a arrancar', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRETO', '');
    expect(() => secretoSesiones()).toThrow(/no arranca/);
  });

  it('en producción, un secreto corto tampoco sirve', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRETO', 'corto');
    expect(() => secretoSesiones()).toThrow(/32/);
  });

  it('en producción, con un secreto de verdad, lo usa', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRETO', 'x'.repeat(64));
    expect(secretoSesiones()).toBe('x'.repeat(64));
  });

  it('fuera de producción deja trabajar sin configurar nada', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRETO', '');
    expect(secretoSesiones()).toBe('solo-desarrollo');
  });
});
