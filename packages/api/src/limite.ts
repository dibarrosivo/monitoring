/**
 * Límite de intentos en memoria, por clave (una IP, un correo). Lo comparten
 * el login y el formulario público de la landing, que antes llevaba su propia
 * copia y nunca olvidaba una IP: la memoria crecía sin tope.
 *
 * En memoria alcanza porque la API corre en un solo proceso. Si algún día
 * corren varias réplicas, esto pasa a Postgres o a un almacén compartido.
 *
 * Ojo: la clave por IP solo sirve si la API ve la IP real del cliente, o sea
 * con `trustProxy` en app.ts. Sin eso todos los pedidos llegan con la IP de
 * Caddy y el límite se vuelve uno solo para todo el mundo.
 */
export interface Limitador {
  /** ¿Puede intentar? Si puede, cuenta el intento. */
  permitir(clave: string, ahora?: number): boolean;
  /** ¿Está bloqueado? No cuenta nada. */
  bloqueado(clave: string, ahora?: number): boolean;
  /** Suma un intento sin preguntar (un fallo que hay que anotar). */
  anotar(clave: string, ahora?: number): void;
  /** Borra lo acumulado (por ejemplo, tras un login correcto). */
  reiniciar(clave: string): void;
}

export function crearLimitador(opciones: { max: number; ventanaMs: number }): Limitador {
  const golpes = new Map<string, number[]>();
  let ultimaLimpieza = 0;

  function vigentes(clave: string, ahora: number): number[] {
    const lista = (golpes.get(clave) ?? []).filter((t) => ahora - t < opciones.ventanaMs);
    if (lista.length) golpes.set(clave, lista);
    else golpes.delete(clave);
    return lista;
  }

  /** Cada tanto se tiran las claves viejas, para que la memoria no crezca sin tope. */
  function limpiar(ahora: number) {
    if (ahora - ultimaLimpieza < opciones.ventanaMs) return;
    ultimaLimpieza = ahora;
    for (const clave of golpes.keys()) vigentes(clave, ahora);
  }

  return {
    permitir(clave, ahora = Date.now()) {
      limpiar(ahora);
      const lista = vigentes(clave, ahora);
      if (lista.length >= opciones.max) return false;
      lista.push(ahora);
      golpes.set(clave, lista);
      return true;
    },
    bloqueado(clave, ahora = Date.now()) {
      return vigentes(clave, ahora).length >= opciones.max;
    },
    anotar(clave, ahora = Date.now()) {
      limpiar(ahora);
      const lista = vigentes(clave, ahora);
      lista.push(ahora);
      golpes.set(clave, lista);
    },
    reiniciar(clave) {
      golpes.delete(clave);
    },
  };
}
