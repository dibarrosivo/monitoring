/**
 * Secretos de la API, con una regla: en producción, sin secreto no se arranca.
 *
 * Antes la clave de las sesiones caía a 'solo-desarrollo' si faltaba la
 * variable de entorno. Si algún día el .env se perdía en un despliegue, la API
 * habría arrancado con un secreto que está escrito en el repositorio, y
 * cualquiera podría haberse fabricado una sesión de administrador. Además `??`
 * no atrapa una variable definida pero vacía, que es lo que deja un .env a
 * medio escribir.
 */
const MINIMO = 32;

export function secretoSesiones(explicito?: string): string {
  const valor = (explicito ?? process.env.JWT_SECRETO ?? '').trim();
  if (valor.length >= MINIMO) return valor;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`JWT_SECRETO falta o tiene menos de ${MINIMO} caracteres: la API no arranca sin él`);
  }
  return valor || 'solo-desarrollo';
}
