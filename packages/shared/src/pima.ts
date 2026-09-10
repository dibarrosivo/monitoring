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
 * Las aperturas por usuario forman un contador en base 26 sobre los dos
 * caracteres: QS es el maestro, QT el usuario 1, QU el 2, y así hasta que el
 * arrastre cambia la primera letra (RA es el usuario 8). Verificado con seis
 * puntos reales: QS, QT, QU, QV, QW, QY y RA.
 */
const BASE_APERTURA = valorBase26('QS');

function valorBase26(codigo: string): number {
  return (codigo.charCodeAt(0) - 65) * 26 + (codigo.charCodeAt(1) - 65);
}

/** Número de usuario de una apertura, o null si el código no es una apertura. */
export function usuarioDeApertura(codigo: string): number | null {
  if (!/^[A-Z]{2}$/.test(codigo)) return null;
  const n = valorBase26(codigo) - BASE_APERTURA;
  // 0 = código maestro. Se acota a 64 usuarios: más allá el patrón no se verificó
  // y es preferible marcarlo sin traducir antes que inventar un número.
  return n >= 0 && n <= 64 ? n : null;
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

  const usuario = usuarioDeApertura(codigo);
  if (usuario !== null && usuario > 0) {
    return interpretarCid({
      numeroCuenta: entrada.numeroCuenta,
      calificador: 1,
      codigoCid: '401',
      particion,
      zona: String(usuario).padStart(3, '0'),
      ocurridoEn: entrada.ocurridoEn,
    });
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
