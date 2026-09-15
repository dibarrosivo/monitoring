import { interpretarCid } from './contactId.js';
import type { EventoNormalizado } from './tipos.js';

/**
 * Códigos de dos letras del receptor PIMA.
 *
 * La tabla sale del catálogo del sistema en uso (365 Connect Pro, tabla de
 * eventos del protocolo 4, leída el 15 de septiembre de 2026), contrastado con
 * el tráfico real de la central. No es una especificación del fabricante, pero
 * es lo que la central viene usando hace años para atender estas cuentas.
 *
 * Casi todo el espacio de códigos son SERIES: las dos letras forman un número
 * en base 26 y cada serie ocupa un tramo contiguo. Por eso la mayoría no está
 * escrita código por código sino como "base + desplazamiento":
 *
 *   AA..DR  alarma en zona 1..96          HK..LB  falla en zona 1..96
 *   DS..HJ  restauración de zona 1..96    LC..OT  exclusión de zona 1..96
 *   OU      cierre con código maestro     OV..PO  cierre por usuario 1..20
 *   PT      armado en casa, maestro       PU..QN  armado en casa, usuario 1..20
 *   QS      apertura con código maestro   QT..RM  apertura por usuario 1..20
 *
 * Lo que queda (PP..PS, QO..QR, RN..TR, UA, UB) son eventos sueltos y van en
 * la tabla explícita, que tiene prioridad sobre las series. Tres códigos del
 * tramo de exclusiones (OA, OM, OT) están ocupados por eventos de horario, así
 * que las exclusiones 77, 89 y 96 no existen. Es así también en el sistema en
 * uso.
 *
 * Todo se traduce a Contact ID para que el resto del sistema (categorías,
 * prioridades, apertura de alarmas) funcione igual sin importar el protocolo.
 */

type Definicion =
  | {
      /** Código Contact ID equivalente */
      cid: string;
      /** 1 = evento nuevo, 3 = restauración o cierre */
      calificador: 1 | 3;
      /** Si falta, se usa la descripción del código Contact ID */
      descripcion?: string;
      /** Zona o número de usuario; si falta, va vacío */
      zona?: string;
    }
  | {
      /**
       * Evento de sistema: no tiene equivalente Contact ID razonable. Abre
       * alarma salvo que el catálogo de protocolos diga lo contrario para su
       * código PIMA-XX.
       */
      sistema: string;
      prioridad: number;
    };

const MAESTRO = '000';

/** Eventos sueltos. Tienen prioridad sobre las series. */
export const TABLA_PIMA: Record<string, Definicion> = {
  // Horarios: los reporta el panel cuando tiene programado horario propio
  OA: { sistema: 'Apertura tarde', prioridad: 3 },
  OM: { sistema: 'Apertura temprana', prioridad: 3 },
  OT: { sistema: 'Cierre tarde', prioridad: 3 },
  SP: { sistema: 'Cierre tarde', prioridad: 3 },
  SQ: { sistema: 'Apertura tarde', prioridad: 3 },
  SR: { sistema: 'Cierre temprano', prioridad: 3 },
  SS: { sistema: 'Apertura temprana', prioridad: 3 },
  TO: { sistema: 'No ha cerrado a horario', prioridad: 3 },
  TP: { sistema: 'No ha abierto a horario', prioridad: 3 },

  // Cierres que no llevan número de usuario
  PP: { cid: '401', calificador: 3, descripcion: 'Cierre con código corto' },
  PQ: { cid: '401', calificador: 3, descripcion: 'Cierre con código temporal' },
  PR: { cid: '403', calificador: 3, descripcion: 'Armado automático' },
  PS: { cid: '409', calificador: 3, descripcion: 'Cierre con llave' },
  UA: { cid: '401', calificador: 3, zona: '021' },
  UB: { cid: '401', calificador: 3, zona: '022' },
  TI: { cid: '401', calificador: 3 },

  // Armado en casa que no lleva número de usuario
  QO: { cid: '441', calificador: 3, descripcion: 'Armado en casa con código corto' },
  QP: { cid: '441', calificador: 3, descripcion: 'Armado en casa con código temporal' },
  QQ: { cid: '441', calificador: 3, descripcion: 'Armado en casa automático' },
  QR: { cid: '441', calificador: 3, descripcion: 'Armado en casa por llave' },

  // Aperturas que no llevan número de usuario
  RN: { cid: '401', calificador: 1, descripcion: 'Apertura con código temporal' },
  RO: { cid: '409', calificador: 1, descripcion: 'Apertura por llave' },
  TJ: { cid: '401', calificador: 1 },
  /** Alguien desarmó bajo amenaza. Es la alarma más seria del protocolo. */
  RP: { cid: '121', calificador: 1, descripcion: 'Apertura bajo coacción (hold-up)' },

  // Sistema y alimentación
  RQ: { sistema: 'Reset de sirena', prioridad: 4 },
  RR: { cid: '305', calificador: 1, descripcion: 'Arranque del sistema' },
  RS: { cid: '137', calificador: 1, descripcion: 'Sabotaje (tamper) abierto' },
  RT: { cid: '137', calificador: 3, descripcion: 'Sabotaje (tamper) cerrado' },
  RU: { cid: '301', calificador: 1 },
  RV: { cid: '301', calificador: 3 },
  RW: { cid: '302', calificador: 1 },
  RX: { cid: '302', calificador: 3 },
  RY: { cid: '351', calificador: 1 },
  RZ: { cid: '351', calificador: 3 },
  SA: { cid: '300', calificador: 1, descripcion: 'Falla de voltaje en detector' },
  SB: { cid: '300', calificador: 3, descripcion: 'Voltaje de detector restaurado' },
  SC: { cid: '321', calificador: 1, descripcion: 'Falla de sirena 1' },
  SD: { cid: '321', calificador: 3, descripcion: 'Sirena 1 restaurada' },
  SE: { cid: '321', calificador: 1, descripcion: 'Falla de sirena 2' },
  SF: { cid: '321', calificador: 3, descripcion: 'Sirena 2 restaurada' },
  SG: { cid: '350', calificador: 1, descripcion: 'El teléfono reporta falla' },
  SH: { cid: '300', calificador: 1, descripcion: 'Voltaje bajo' },
  SI: { cid: '333', calificador: 1, descripcion: 'Falla de tarjeta de expansión' },
  SJ: { cid: '333', calificador: 3, descripcion: 'Tarjeta de expansión restaurada' },
  SK: { cid: '120', calificador: 1, descripcion: 'Pánico desde teclado' },
  SL: { sistema: 'Código incorrecto en teclado', prioridad: 3 },
  SM: { cid: '601', calificador: 1 },
  SN: { cid: '602', calificador: 1, descripcion: 'Prueba automática' },
  SO: { cid: '601', calificador: 1, descripcion: 'Prueba disparada' },
  ST: { cid: '330', calificador: 1, descripcion: 'Falla del receptor inalámbrico' },
  SU: { cid: '137', calificador: 1, descripcion: 'Sabotaje del receptor inalámbrico' },
  SV: { cid: '344', calificador: 1 },
  TN: { cid: '334', calificador: 1, descripcion: 'Falla de repetidor' },

  /**
   * SW: el sistema en uso lo etiqueta "HOLD-UP 00" pero NO lo monitorea, y en
   * el tráfico real llega un minuto antes de cada cierre (SW, luego PA; SW,
   * luego PD), de 16 cuentas distintas, decenas de veces por semana. Un atraco
   * no se comporta así. Se registra sin abrir alarma; el atraco real es RP.
   */
  SW: { sistema: 'Aviso previo al cierre', prioridad: 5 },
  SX: { cid: '120', calificador: 1 },
  SY: { cid: '110', calificador: 1 },
  SZ: { cid: '158', calificador: 1, descripcion: 'Temperatura' },
  TF: { cid: '140', calificador: 1 },
  TG: { sistema: 'Reset', prioridad: 5 },
  TH: { cid: '602', calificador: 1 },
  TK: { cid: '380', calificador: 1, descripcion: 'Falla de zona o anti-máscara' },
};

function valorBase26(codigo: string): number {
  return (codigo.charCodeAt(0) - 65) * 26 + (codigo.charCodeAt(1) - 65);
}

const ZONAS = 96;
const USUARIOS = 20;

/** Series por zona: base y traducción. El desplazamiento es la zona menos uno. */
const SERIES_ZONA = [
  { base: valorBase26('AA'), cid: '140', calificador: 1 as const, que: 'Alarma' },
  { base: valorBase26('DS'), cid: '140', calificador: 3 as const, que: 'Alarma' },
  { base: valorBase26('HK'), cid: '380', calificador: 1 as const, que: 'Falla' },
  { base: valorBase26('LC'), cid: '570', calificador: 1 as const, que: 'Exclusión' },
];

/** Series por usuario: el maestro es el cero de cada una. */
const BASE_CIERRE = valorBase26('OU');
const BASE_CASA = valorBase26('PT');
const BASE_APERTURA = valorBase26('QS');

/** 0 = código maestro; null si el código no pertenece a esta serie. */
function usuarioDeSerie(codigo: string, base: number): number | null {
  if (!/^[A-Z]{2}$/.test(codigo)) return null;
  const n = valorBase26(codigo) - base;
  return n >= 0 && n <= USUARIOS ? n : null;
}

/** Número de usuario de una apertura, o null si el código no es una apertura. */
export function usuarioDeApertura(codigo: string): number | null {
  return usuarioDeSerie(codigo, BASE_APERTURA);
}

/** Número de usuario de un cierre, o null si el código no es un cierre. */
export function usuarioDeCierre(codigo: string): number | null {
  return usuarioDeSerie(codigo, BASE_CIERRE);
}

/** Número de usuario de un armado en casa, o null si no lo es. */
export function usuarioDeArmadoEnCasa(codigo: string): number | null {
  return usuarioDeSerie(codigo, BASE_CASA);
}

/** Zona de una serie por zona, o null si el código no cae en ninguna. */
function zonaDeSerie(codigo: string): { zona: number; serie: (typeof SERIES_ZONA)[number] } | null {
  if (!/^[A-Z]{2}$/.test(codigo)) return null;
  const v = valorBase26(codigo);
  for (const serie of SERIES_ZONA) {
    const n = v - serie.base;
    if (n >= 0 && n < ZONAS) return { zona: n + 1, serie };
  }
  return null;
}

function tresDigitos(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Traduce una línea del receptor PIMA a nuestro evento normalizado.
 *
 * Un código que no está en la tabla ni en ninguna serie se marca como evento
 * de sistema, no como desconocido: así abre alarma y alguien lo mira. Es
 * deliberado. Preferimos una alarma de más ante un código nuevo antes que
 * dejar pasar en silencio algo que podría ser un atraco.
 */
export function interpretarPima(entrada: {
  numeroCuenta: string;
  codigo: string;
  particion?: string;
  ocurridoEn?: Date;
}): EventoNormalizado {
  const codigo = entrada.codigo.toUpperCase();
  const particion = entrada.particion ?? '01';
  const comun = { numeroCuenta: entrada.numeroCuenta, particion, ocurridoEn: entrada.ocurridoEn };

  // Códigos numéricos: estado interno del receptor, no del panel de un cliente.
  // Se ven siempre sobre la cuenta propia del receptor (8000) y en pares, cada
  // 45 minutos. El sistema en uso los descarta sin mostrarlos. Se registran con
  // prioridad mínima y sin abrir alarma: sirven como latido del receptor.
  if (/^\d{2}$/.test(codigo)) {
    return {
      ...comun,
      calificador: 1,
      codigoCid: '000',
      codigo: `PIMA-${codigo}`,
      zona: '',
      categoria: 'prueba',
      descripcion: `Estado interno del receptor (código ${codigo})`,
      prioridad: 5,
    };
  }

  const def = TABLA_PIMA[codigo];
  if (def) {
    if ('sistema' in def) {
      return {
        ...comun,
        calificador: 1,
        codigoCid: '000',
        codigo: `PIMA-${codigo}`,
        zona: '',
        categoria: 'sistema',
        descripcion: def.sistema,
        prioridad: def.prioridad,
      };
    }
    const evento = interpretarCid({ ...comun, calificador: def.calificador, codigoCid: def.cid, zona: def.zona ?? '' });
    return def.descripcion ? { ...evento, descripcion: conPrefijo(evento, def.descripcion) } : evento;
  }

  // Cierre, armado en casa o apertura por número de usuario
  for (const [buscar, cid, calificador] of [
    [usuarioDeCierre, '401', 3],
    [usuarioDeArmadoEnCasa, '441', 3],
    [usuarioDeApertura, '401', 1],
  ] as const) {
    const usuario = buscar(codigo);
    if (usuario !== null) {
      // El maestro no lleva número de usuario
      return interpretarCid({ ...comun, calificador, codigoCid: cid, zona: usuario === 0 ? MAESTRO : tresDigitos(usuario) });
    }
  }

  // Alarma, restauración, falla o exclusión por zona
  const porZona = zonaDeSerie(codigo);
  if (porZona) {
    const { zona, serie } = porZona;
    const evento = interpretarCid({ ...comun, calificador: serie.calificador, codigoCid: serie.cid, zona: tresDigitos(zona) });
    return { ...evento, descripcion: conPrefijo(evento, `${serie.que} en zona ${zona}`) };
  }

  return {
    ...comun,
    calificador: 1,
    codigoCid: '000',
    codigo: `PIMA-${codigo}`,
    zona: '',
    categoria: 'sistema',
    descripcion: `Evento PIMA sin traducir (código ${codigo})`,
    prioridad: 3,
  };
}

/** Conserva el prefijo que pone interpretarCid ("Restauración: ", "Cierre (armado): ") y cambia el resto. */
function conPrefijo(evento: EventoNormalizado, descripcion: string): string {
  const separador = evento.descripcion.indexOf(': ');
  return separador === -1 ? descripcion : `${evento.descripcion.slice(0, separador + 2)}${descripcion}`;
}
