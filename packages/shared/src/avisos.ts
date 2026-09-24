import type { CategoriaEvento } from './tipos.js';
import type { CanalPush } from './central.js';
import type { GrupoAviso } from './preferencias.js';

/**
 * Qué se le dice al usuario cuando pasa algo. La app es el operador del
 * usuario: no le muestra un código, le habla como lo haría una persona de
 * la central. El servidor usa las mismas frases para el push (app cerrada) y
 * la app para el WebSocket y su historial (app abierta): una sola redacción.
 *
 * Las frases son cortas y van de lo importante a lo accesorio: primero qué
 * pasó, después dónde. En un teléfono en el bolsillo, las primeras dos
 * palabras son las que se escuchan.
 */

/** Lo mínimo que hace falta saber de un evento para redactar su aviso. */
export interface CargaAviso {
  eventoId: number;
  panelId: number | null;
  categoria?: CategoriaEvento;
  codigo?: string;
  descripcion: string;
  prioridad: number;
  zona?: string | null;
  zonaDescripcion?: string | null;
  sitioNombre?: string | null;
}

export type Tono = 'emergencia' | 'alarma' | 'aviso' | 'estado' | 'bien';

export interface Frase {
  /** Título corto de la notificación ("ALARMA", "Sistema armado") */
  titulo: string;
  /** Cuerpo de la notificación, sin repetir el título ("Armado por Ana") */
  cuerpo: string;
  /** La frase completa, para decirla en voz alta o mostrarla sola ("Sistema armado por Ana") */
  texto: string;
  tono: Tono;
  /** true si el aviso debe quedarse en pantalla hasta que el usuario lo toque */
  persistente: boolean;
  /** Canal de Android: 'alarmas' suena con sirena y pasa el silencio; 'avisos' es normal */
  canal: CanalPush;
  /** Preferencia que lo apaga; null = no se puede apagar */
  grupo: GrupoAviso | null;
}

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
function donde(carga: CargaAviso, nombrarSitio: boolean): string {
  return nombrarSitio && carga.sitioNombre ? ` en ${carga.sitioNombre}` : '';
}

function zonaHablada(carga: CargaAviso): string {
  if (!carga.zona) return '';
  const numero = Number(carga.zona);
  const nombre = carga.zonaDescripcion ? `, ${carga.zonaDescripcion}` : '';
  return Number.isFinite(numero) && numero > 0 ? ` en zona ${numero}${nombre}` : '';
}

/** Saca el prefijo que pone el servidor ("Restauración: ", "Cierre (armado): "). */
function sinPrefijo(descripcion: string): string {
  return descripcion.replace(/^[^:]{1,30}:\s*/, '');
}

/** Saca el " — Nombre (cód. 3)" o " — Nombre (desde la app)" que agrega el servidor en aperturas y cierres. */
function persona(descripcion: string): string | null {
  const remoto = / — (.+?) \(desde la (app|central)\)$/.exec(descripcion);
  if (remoto) return `${remoto[1]} desde la ${remoto[2]}`;
  const m = / — (.+?) \(cód\. \d+\)$/.exec(descripcion);
  return m ? m[1]! : null;
}

/** Grupo de preferencia de un aviso según su categoría; alarmas y emergencias no tienen. */
export function grupoDeAviso(categoria: CategoriaEvento | undefined, tono: Tono): GrupoAviso | null {
  if (tono === 'emergencia' || tono === 'alarma') return null;
  switch (categoria) {
    case 'apertura':
    case 'cierre':
    case 'cancelacion':
      return 'armadoDesarmado';
    case 'averia':
    case 'restauracion':
    case 'anulacion':
      return 'averias';
    default:
      return 'sistema';
  }
}

function armar(carga: CargaAviso, parte: { titulo: string; cuerpo: string; texto?: string; tono: Tono; persistente?: boolean }): Frase {
  const tono = parte.tono;
  return {
    titulo: parte.titulo,
    cuerpo: parte.cuerpo,
    texto: parte.texto ?? parte.cuerpo,
    tono,
    persistente: parte.persistente ?? (tono === 'emergencia' || tono === 'alarma'),
    canal: tono === 'emergencia' || tono === 'alarma' ? 'alarmas' : 'avisos',
    grupo: grupoDeAviso(carga.categoria, tono),
  };
}

/**
 * Frase para un evento, o null si no hay nada que decir (pruebas periódicas,
 * latidos del receptor). `nombrarSitio`: true si el usuario ve más de un sitio.
 */
export function fraseParaEvento(carga: CargaAviso, opciones: { nombrarSitio: boolean }): Frase | null {
  const categoria = carga.categoria;
  const codigo = carga.codigo ?? '';
  const lugar = donde(carga, opciones.nombrarSitio);

  if (!categoria || categoria === 'prueba') return null;
  if (codigo.startsWith('PIMA-0')) return null;

  switch (categoria) {
    case 'cierre': {
      const quien = persona(carga.descripcion);
      const modo = codigo === 'R441' ? 'armado en casa' : 'armado';
      const resto = `${lugar}${quien ? ` por ${quien}` : ''}`;
      return armar(carga, { titulo: 'Sistema armado', cuerpo: `${modo[0]!.toUpperCase()}${modo.slice(1)}${resto}`, texto: `Sistema ${modo}${resto}`, tono: 'estado' });
    }
    case 'apertura': {
      const quien = persona(carga.descripcion);
      const resto = `${lugar}${quien ? ` por ${quien}` : ''}`;
      return armar(carga, { titulo: 'Sistema desarmado', cuerpo: `Desarmado${resto}`, texto: `Sistema desarmado${resto}`, tono: 'estado' });
    }
    case 'alarma': {
      const emergencia = EMERGENCIAS[codigoCid(codigo)];
      if (emergencia || carga.prioridad <= 1) {
        const que = `${emergencia ?? sinPrefijo(carga.descripcion).toLowerCase()}${lugar}`;
        return armar(carga, { titulo: 'EMERGENCIA', cuerpo: que, texto: `Emergencia: ${que}`, tono: 'emergencia' });
      }
      const zona = zonaHablada(carga);
      const detalle = zona ? '' : `: ${sinPrefijo(carga.descripcion)}`;
      return armar(carga, { titulo: 'ALARMA', cuerpo: `Alarma${zona}${lugar}${detalle}`, tono: 'alarma' });
    }
    case 'cancelacion':
      return armar(carga, { titulo: 'Alarma cancelada', cuerpo: `Alarma cancelada${lugar}`, tono: 'bien' });
    case 'restauracion': {
      // "Restauración de electricidad en Gerald's Café"; con prefijo genérico ("Restauración: Robo") se dice como restablecido
      const natural = !/^[^:]{1,30}:\s/.test(carga.descripcion);
      if (natural) return armar(carga, { titulo: carga.descripcion, cuerpo: `${carga.descripcion}${zonaHablada(carga)}${lugar}`, tono: 'bien' });
      const que = `${sinPrefijo(carga.descripcion)}${zonaHablada(carga)}${lugar}`;
      return armar(carga, { titulo: 'Restablecido', cuerpo: que, texto: `Restablecido: ${que}`, tono: 'bien' });
    }
    case 'averia': {
      const que = `${carga.descripcion}${zonaHablada(carga)}${lugar}`;
      return armar(carga, { titulo: 'Aviso', cuerpo: que, texto: `Aviso: ${que}`, tono: 'aviso' });
    }
    case 'anulacion':
      return armar(carga, { titulo: 'Zona anulada', cuerpo: `Zona anulada${zonaHablada(carga)}${lugar}`, tono: 'aviso' });
    default: {
      // Avisos del sistema (motor, receptor): los de prioridad máxima suenan como alarma y no se apagan
      const que = `${carga.descripcion}${lugar}`;
      const grave = carga.prioridad <= 1;
      return armar(carga, { titulo: 'Aviso de la central', cuerpo: que, texto: `Aviso de la central: ${que}`, tono: grave ? 'alarma' : 'aviso', persistente: carga.prioridad <= 2 });
    }
  }
}
