import type { MensajeTiempoReal } from '../tipos.js';

/**
 * Qué dice la app cuando pasa algo. La app es el operador del usuario: no le
 * muestra un código, le habla como lo haría una persona de la central.
 *
 * Las frases son cortas y van de lo importante a lo accesorio: primero qué
 * pasó, después dónde. En un teléfono en el bolsillo, las primeras dos
 * palabras son las que se escuchan.
 */

export type Tono = 'emergencia' | 'alarma' | 'aviso' | 'estado' | 'bien';

export interface Frase {
  texto: string;
  tono: Tono;
  /** true si el aviso debe quedarse en pantalla hasta que el usuario lo toque */
  persistente: boolean;
}

type Carga = MensajeTiempoReal['carga'];

/** Nombre corto de las emergencias de prioridad máxima, por código Contact ID. */
const EMERGENCIAS: Record<string, string> = {
  '100': 'emergencia médica',
  '101': 'emergencia personal',
  '110': 'incendio',
  '111': 'humo',
  '112': 'combustión',
  '113': 'flujo de agua',
  '114': 'calor',
  '115': 'pulsador de incendio',
  '117': 'llama',
  '120': 'pánico',
  '121': 'coacción',
  '122': 'pánico silencioso',
  '123': 'pánico',
  '151': 'gas',
  '162': 'monóxido de carbono',
};

function codigoCid(codigo: string | undefined): string {
  const m = /^[ER](\d{3})$/.exec(codigo ?? '');
  return m ? m[1]! : '';
}

/** "en Panadería K3", o nada si el usuario tiene un solo sitio. */
function donde(carga: Carga, nombrarSitio: boolean): string {
  return nombrarSitio && carga.sitioNombre ? ` en ${carga.sitioNombre}` : '';
}

function zonaHablada(carga: Carga): string {
  if (!carga.zona) return '';
  const numero = Number(carga.zona);
  const nombre = carga.zonaDescripcion ? `, ${carga.zonaDescripcion}` : '';
  return Number.isFinite(numero) && numero > 0 ? ` en zona ${numero}${nombre}` : '';
}

/** Saca el prefijo que pone el servidor ("Restauración: ", "Cierre (armado): "). */
function sinPrefijo(descripcion: string): string {
  return descripcion.replace(/^[^:]{1,30}:\s*/, '');
}

/** Saca el " — Nombre (cód. 3)" que agrega el servidor en aperturas y cierres. */
function persona(descripcion: string): string | null {
  const m = / — (.+?) \(cód\. \d+\)$/.exec(descripcion);
  return m ? m[1]! : null;
}

/**
 * Frase para un evento, o null si no hay nada que decir (pruebas periódicas,
 * latidos del receptor).
 */
export function fraseParaEvento(carga: Carga, opciones: { nombrarSitio: boolean }): Frase | null {
  const categoria = carga.categoria;
  const codigo = carga.codigo ?? '';
  const lugar = donde(carga, opciones.nombrarSitio);

  if (!categoria || categoria === 'prueba') return null;
  if (codigo.startsWith('PIMA-0')) return null;

  switch (categoria) {
    case 'cierre': {
      const quien = persona(carga.descripcion);
      const modo = codigo === 'R441' ? 'Sistema armado en casa' : 'Sistema armado';
      return { texto: `${modo}${lugar}${quien ? ` por ${quien}` : ''}`, tono: 'estado', persistente: false };
    }
    case 'apertura': {
      const quien = persona(carga.descripcion);
      return { texto: `Sistema desarmado${lugar}${quien ? ` por ${quien}` : ''}`, tono: 'estado', persistente: false };
    }
    case 'alarma': {
      const emergencia = EMERGENCIAS[codigoCid(codigo)];
      if (emergencia || carga.prioridad <= 1) {
        return {
          texto: `Emergencia: ${emergencia ?? sinPrefijo(carga.descripcion).toLowerCase()}${lugar}`,
          tono: 'emergencia',
          persistente: true,
        };
      }
      const zona = zonaHablada(carga);
      const detalle = zona ? '' : `: ${sinPrefijo(carga.descripcion)}`;
      return { texto: `Alarma${zona}${lugar}${detalle}`, tono: 'alarma', persistente: true };
    }
    case 'cancelacion':
      return { texto: `Alarma cancelada${lugar}`, tono: 'bien', persistente: false };
    case 'restauracion': {
      // "Restauración de electricidad en Gerald's Café"; con prefijo genérico ("Restauración: Robo") se dice como restablecido
      const natural = !/^[^:]{1,30}:\s/.test(carga.descripcion);
      return {
        texto: natural ? `${carga.descripcion}${zonaHablada(carga)}${lugar}` : `Restablecido${lugar}: ${sinPrefijo(carga.descripcion)}${zonaHablada(carga)}`,
        tono: 'bien',
        persistente: false,
      };
    }
    case 'averia':
      return { texto: `Aviso${lugar}: ${carga.descripcion}${zonaHablada(carga)}`, tono: 'aviso', persistente: false };
    case 'anulacion':
      return { texto: `Zona anulada${zonaHablada(carga)}${lugar}`, tono: 'aviso', persistente: false };
    case 'sistema':
      return { texto: `Aviso${lugar}: ${carga.descripcion}`, tono: 'aviso', persistente: carga.prioridad <= 2 };
    default:
      return { texto: `${carga.descripcion}${lugar}`, tono: 'aviso', persistente: false };
  }
}
