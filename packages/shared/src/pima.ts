import { interpretarCid } from './contactId.js';
import type { EventoNormalizado } from './tipos.js';

/**
 * Códigos de dos caracteres del receptor PIMA.
 *
 * La tabla NO es una especificación del fabricante: se obtuvo correlacionando
 * el tráfico real de la central con los eventos ya traducidos por el sistema en
 * uso, el 10 de septiembre de 2026. Cada entrada de acá abajo se observó de
 * verdad; lo que no se observó no se inventa y cae en "sin traducir".
 *
 * Se traducen a Contact ID para que el resto del sistema (categorías,
 * prioridades, apertura de alarmas) funcione igual sin importar el protocolo
 * de origen.
 */

interface DefinicionPima {
  /** Código Contact ID equivalente */
  cid: string;
  /** 1 = evento nuevo, 3 = restauración o cierre */
  calificador: 1 | 3;
  descripcion: string;
}

/** Códigos observados en el tráfico real, con su traducción confirmada. */
export const TABLA_PIMA: Record<string, DefinicionPima> = {
  TH: { cid: '602', calificador: 1, descripcion: 'Prueba periódica' },
  QS: { cid: '401', calificador: 1, descripcion: 'Apertura con código maestro' },
  OU: { cid: '401', calificador: 3, descripcion: 'Cierre con código maestro' },
  RW: { cid: '302', calificador: 1, descripcion: 'Batería baja' },
  RX: { cid: '302', calificador: 3, descripcion: 'Batería restaurada' },
  SW: { cid: '120', calificador: 1, descripcion: 'Atraco (hold-up)' },
};

/**
 * Aperturas y cierres forman cada uno un contador en base 26 sobre los dos
 * caracteres, con el código maestro como cero:
 *
 *   aperturas: QS maestro, QT usuario 1, QU el 2 … RA el 8 (el arrastre cambia
 *              la primera letra). Verificado con siete puntos reales.
 *   cierres:   OU maestro, OV usuario 1. Verificado con dos puntos reales; el
 *              sistema en uso tradujo OV de la cuenta 7028 como "Cierre 1".
 */
const BASE_APERTURA = valorBase26('QS');
const BASE_CIERRE = valorBase26('OU');

function valorBase26(codigo: string): number {
  return (codigo.charCodeAt(0) - 65) * 26 + (codigo.charCodeAt(1) - 65);
}

/**
 * Tope de usuarios que se aceptan por aritmética. No es un número redondo
 * elegido al azar: las dos series y los códigos de otros eventos conviven en el
 * mismo espacio de dos letras, y un rango más ancho los pisaría. QS (apertura
 * maestro) caería como "cierre 50", y RW y RX, que son batería, caerían como
 * aperturas 30 y 31. El máximo observado en el tráfico real es 8, así que 16
 * deja margen de sobra sin invadir códigos que significan otra cosa.
 */
const MAX_USUARIO = 16;

/** 0 = código maestro; null si el código no pertenece a esta serie. */
function usuarioDeSerie(codigo: string, base: number): number | null {
  if (!/^[A-Z]{2}$/.test(codigo)) return null;
  const n = valorBase26(codigo) - base;
  return n >= 0 && n <= MAX_USUARIO ? n : null;
}

/** Número de usuario de una apertura, o null si el código no es una apertura. */
export function usuarioDeApertura(codigo: string): number | null {
  return usuarioDeSerie(codigo, BASE_APERTURA);
}

/** Número de usuario de un cierre, o null si el código no es un cierre. */
export function usuarioDeCierre(codigo: string): number | null {
  return usuarioDeSerie(codigo, BASE_CIERRE);
}

/**
 * Traduce una línea del receptor PIMA a nuestro evento normalizado.
 *
 * Un código que no está en la tabla ni encaja en el patrón de aperturas se
 * marca como evento de sistema, no como desconocido: así abre alarma y alguien
 * lo mira. Es deliberado. Preferimos una alarma de más ante un código nuevo
 * antes que dejar pasar en silencio algo que podría ser un atraco.
 */
export function interpretarPima(entrada: {
  numeroCuenta: string;
  codigo: string;
  particion?: string;
  ocurridoEn?: Date;
}): EventoNormalizado {
  const codigo = entrada.codigo.toUpperCase();
  const particion = entrada.particion ?? '01';

  // Códigos numéricos: estado interno del receptor, no del panel de un cliente.
  // Se ven siempre sobre la cuenta propia del receptor (8000) y en pares, varias
  // veces por día. El sistema en uso ni siquiera los muestra al operador. Se
  // registran con prioridad mínima y sin abrir alarma para no inundar la cola.
  // Qué significan exactamente está sin confirmar.
  if (/^\d{2}$/.test(codigo)) {
    return {
      numeroCuenta: entrada.numeroCuenta,
      calificador: 1,
      codigoCid: '000',
      codigo: `PIMA-${codigo}`,
      particion,
      zona: '',
      categoria: 'prueba',
      descripcion: `Estado interno del receptor (código ${codigo})`,
      prioridad: 5,
      ocurridoEn: entrada.ocurridoEn,
    };
  }

  const def = TABLA_PIMA[codigo];
  if (def) {
    return interpretarCid({
      numeroCuenta: entrada.numeroCuenta,
      calificador: def.calificador,
      codigoCid: def.cid,
      particion,
      // El maestro no lleva número de usuario
      zona: codigo === 'QS' || codigo === 'OU' ? '000' : '',
      ocurridoEn: entrada.ocurridoEn,
    });
  }

  // Apertura o cierre por número de usuario
  for (const [buscar, calificador] of [
    [usuarioDeApertura, 1],
    [usuarioDeCierre, 3],
  ] as const) {
    const usuario = buscar(codigo);
    if (usuario !== null && usuario > 0) {
      return interpretarCid({
        numeroCuenta: entrada.numeroCuenta,
        calificador,
        codigoCid: '401',
        particion,
        zona: String(usuario).padStart(3, '0'),
        ocurridoEn: entrada.ocurridoEn,
      });
    }
  }

  return {
    numeroCuenta: entrada.numeroCuenta,
    calificador: 1,
    codigoCid: '000',
    codigo: `PIMA-${codigo}`,
    particion,
    zona: '',
    categoria: 'sistema',
    descripcion: `Evento PIMA sin traducir (código ${codigo})`,
    prioridad: 3,
    ocurridoEn: entrada.ocurridoEn,
  };
}
