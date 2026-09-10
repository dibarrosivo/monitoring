import type { CategoriaEvento } from './tipos.js';

/**
 * Protocolo de atención por tipo de evento.
 *
 * El plan de acción que el cliente tiene cargado dice qué hacer EN ESE SITIO:
 * a quién llamar, dónde están las llaves, si hay perro. Este catálogo dice qué
 * hacer ANTE ESE EVENTO, sin importar el sitio: un robo no se atiende como un
 * incendio. Los dos se muestran juntos al operador y se complementan.
 *
 * Vive en código y no en la base a propósito: es doctrina de la central, no
 * dato de un cliente. Cambiarlo es una decisión que se revisa y se versiona.
 *
 * Los pasos son una guía, no una obligación: el operador puede cerrar sin
 * marcarlos todos. Marcar uno deja una entrada en la bitácora de la alarma, y
 * de ahí se deduce qué está hecho, así que no hay dos fuentes de verdad que
 * puedan contradecirse.
 */
export interface Protocolo {
  /** Pasos sugeridos, en el orden en que conviene seguirlos */
  pasos: string[];
  /**
   * Si es false, el evento NO abre alarma aunque su categoría normalmente lo
   * haría. Sirve para eventos ruidosos que no merecen sacar al operador de lo
   * que está haciendo.
   */
  autoAbre?: boolean;
}

const LLAMAR = 'Llamar al sitio y pedir la palabra clave';
const CONTACTOS = 'Llamar a los contactos por orden de la lista';
const VERIFICAR = 'Verificar si el evento se repite o se restaura solo';

/**
 * Indexado por código Contact ID de tres dígitos. Los códigos propios de la
 * central (supervisión de horarios, puente caído) usan su propia clave.
 */
export const CATALOGO_PROTOCOLOS: Record<string, Protocolo> = {
  // ── Máxima prioridad: hay personas en riesgo ──────────────────────────
  '100': { pasos: ['Confirmar la emergencia médica', CONTACTOS, 'Coordinar ambulancia', 'Registrar a quién se avisó'] },
  '110': {
    pasos: [
      'Avisar a bomberos sin esperar confirmación',
      LLAMAR,
      CONTACTOS,
      'Registrar la hora del aviso a bomberos',
    ],
  },
  '120': { pasos: ['NO llamar al sitio: puede haber alguien coaccionado', 'Avisar a la policía', CONTACTOS] },
  '121': {
    pasos: [
      'Coacción: la palabra clave puede darse bajo amenaza',
      'NO alertar por teléfono que se detectó la coacción',
      'Avisar a la policía',
      CONTACTOS,
    ],
  },
  '122': { pasos: ['Pánico silencioso: no llamar al sitio', 'Avisar a la policía', CONTACTOS] },

  // ── Robo ──────────────────────────────────────────────────────────────
  '130': {
    pasos: [
      LLAMAR,
      'Si no atienden o la palabra clave es incorrecta, despachar móvil',
      CONTACTOS,
      'Avisar a la policía si se confirma la intrusión',
      'Registrar qué zona disparó',
    ],
  },
  '131': { pasos: [LLAMAR, 'Verificar la zona perimetral', CONTACTOS] },
  '134': { pasos: [LLAMAR, 'Confirmar si alguien entró por una zona de retardo', CONTACTOS] },
  '139': { pasos: ['Robo verificado: despachar móvil', 'Avisar a la policía', CONTACTOS] },

  // ── Averías: no urgen, pero dejan el sitio desprotegido ───────────────
  '301': { pasos: ['Confirmar si hay corte de energía en la zona', VERIFICAR, 'Avisar al cliente si persiste'] },
  '302': { pasos: ['Batería baja: el equipo queda sin respaldo ante un corte', 'Avisar al cliente', 'Agendar el cambio de batería'] },
  '350': { pasos: ['Falla de comunicación', VERIFICAR, 'Avisar al instalador si persiste'] },
  '354': { pasos: ['El equipo no logró comunicar un evento', 'Revisar si llegaron señales posteriores', 'Avisar al instalador si se repite'] },
  '380': { pasos: ['Avería de sensor', 'Avisar al cliente', 'Agendar revisión técnica'] },

  // ── Operación normal ──────────────────────────────────────────────────
  '401': { pasos: ['Verificar que el horario sea el habitual del sitio'], autoAbre: false },
  '602': { pasos: [], autoAbre: false },

  // ── Eventos que genera la central ─────────────────────────────────────
  'HOR-AT': { pasos: ['El sitio no abrió a la hora prevista', LLAMAR, CONTACTOS] },
  'HOR-SC': { pasos: ['El sitio no cerró a la hora prevista', LLAMAR, CONTACTOS, 'Verificar si quedó gente adentro'] },
  'HOR-AF': {
    pasos: [
      'Apertura fuera de horario: alguien entró con código válido cuando no debía',
      LLAMAR,
      'Confirmar con los contactos que la persona está autorizada',
      'Despachar móvil si no se confirma',
    ],
  },
  BRIDGE: {
    pasos: [
      'El puente de la central dejó de reportar: quedamos ciegos a un receptor entero',
      'Verificar que la PC del puente esté encendida y con red',
      'Revisar que el receptor tenga energía',
      'Avisar al responsable técnico de inmediato',
    ],
  },
  SILENCIO: {
    pasos: ['El equipo lleva demasiado tiempo sin reportar', 'Llamar al sitio para verificar', 'Agendar revisión técnica'],
  },
};

/** Pasos genéricos cuando el código no está en el catálogo, según su categoría. */
const POR_CATEGORIA: Partial<Record<CategoriaEvento, string[]>> = {
  alarma: [LLAMAR, CONTACTOS, 'Despachar móvil si no se puede verificar'],
  averia: [VERIFICAR, 'Avisar al cliente si persiste'],
  cancelacion: ['Confirmar con quien canceló que la situación está controlada'],
  sistema: ['Revisar el detalle del evento', 'Escalar al responsable técnico si corresponde'],
};

/**
 * Pasos sugeridos para un evento. Devuelve lista vacía cuando no hay nada
 * sensato que sugerir, y en ese caso la consola no muestra la sección.
 */
export function protocoloPara(entrada: {
  codigo: string;
  codigoCid?: string;
  categoria: CategoriaEvento;
}): string[] {
  const directo = CATALOGO_PROTOCOLOS[entrada.codigo] ?? CATALOGO_PROTOCOLOS[entrada.codigoCid ?? ''];
  if (directo) return directo.pasos;
  return POR_CATEGORIA[entrada.categoria] ?? [];
}

/**
 * ¿Este evento debe abrir alarma? Solo responde false cuando el catálogo lo
 * dice explícitamente; ante la duda abre, porque una alarma de más molesta y
 * una de menos puede costar caro.
 */
export function abreAlarma(entrada: { codigo: string; codigoCid?: string }): boolean {
  const def = CATALOGO_PROTOCOLOS[entrada.codigo] ?? CATALOGO_PROTOCOLOS[entrada.codigoCid ?? ''];
  return def?.autoAbre !== false;
}
