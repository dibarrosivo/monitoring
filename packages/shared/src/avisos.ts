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

/**
 * Averías cuyo nombre técnico no le dice nada al dueño de la alarma. El
 * operador sigue viendo el texto del manual de Contact ID en la consola; en
 * el teléfono del cliente se cambia por lo que de verdad le pasó a su equipo.
 */
const AVERIAS_PARA_EL_CLIENTE: Record<string, string> = {
  E350: 'Problema de comunicación con la central',
  E354: 'Falla al reportar a la central',
  R354: 'Restauración de comunicación con la central',
};

/** Primera letra en mayúscula; el resto queda igual (siglas y nombres propios intactos). */
function mayuscula(texto: string): string {
  return texto ? `${texto[0]!.toUpperCase()}${texto.slice(1)}` : texto;
}

function codigoCid(codigo: string | undefined): string {
  const m = /^[ER](\d{3})$/.exec(codigo ?? '');
  return m ? m[1]! : '';
}

/** "en Panadería K3", o nada si el usuario tiene un solo sitio. */
function donde(carga: CargaAviso, nombrarSitio: boolean): string {
  return nombrarSitio && carga.sitioNombre ? ` en ${carga.sitioNombre}` : '';
}

/**
 * ¿En este evento el campo "zona" es de verdad una zona? En las alarmas y en
 * las anulaciones sí. En las averías no se dice nada más que la falla: en los
 * códigos de sistema (electricidad, batería, comunicación) ese campo es la
 * vía o el módulo, y aun en las de sensor el usuario prefiere solo la falla.
 */
function zonaAmerita(carga: CargaAviso): boolean {
  if (carga.categoria === 'averia') return false;
  const cid = codigoCid(carga.codigo);
  if (carga.categoria === 'restauracion') return cid === '' || cid < '300' || cid >= '500';
  return true;
}

function zonaHablada(carga: CargaAviso): string {
  if (!carga.zona || !zonaAmerita(carga)) return '';
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

/**
 * «usuario 003 desconocido»: alguien armó o desarmó con un código de teclado
 * que nadie registró. Para el dueño de una alarma eso no es un detalle: puede
 * ser un empleado que no declaró, o alguien que no debería tener código.
 *
 * El 000 queda afuera a propósito. No es una persona sin registrar: es armar
 * sin teclear código de usuario (armado rápido), y en producción son casi la
 * mitad de los casos. Llamarlo «desconocido» sería decir algo falso, seguido.
 */
export function usuarioDesconocido(zona: string | null | undefined): string | null {
  const numero = (zona ?? '').trim();
  if (!numero || !/^\d+$/.test(numero) || Number(numero) === 0) return null;
  return `usuario ${numero} desconocido`;
}

/**
 * El código 000 es armar o desarmar sin que nadie teclee un código de usuario
 * («armado rápido» en la jerga de la central, y así lo llamaba 365). No es una
 * persona sin registrar, así que se dice lo que pasó en vez de llamarla
 * desconocida. Si la cuenta tiene un nombre dado de alta para el 000, ese
 * nombre manda y esto no se usa.
 */
export function sinCodigoDeUsuario(zona: string | null | undefined): boolean {
  const numero = (zona ?? '').trim();
  return /^\d+$/.test(numero) && Number(numero) === 0;
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
      const quien = persona(carga.descripcion) ?? usuarioDesconocido(carga.zona);
      const rapido = !quien && sinCodigoDeUsuario(carga.zona);
      // "armado modo casa" y no "armado en casa": si no, el sitio queda como "en casa en Panadería"
      const modo = rapido ? 'armado rápido' : codigo === 'R441' ? 'armado modo casa' : 'armado';
      const resto = `${lugar}${quien ? ` por ${quien}` : ''}`;
      return armar(carga, { titulo: 'Sistema armado', cuerpo: `${mayuscula(modo)}${resto}`, texto: `Sistema ${modo}${resto}`, tono: 'estado' });
    }
    case 'apertura': {
      const quien = persona(carga.descripcion) ?? usuarioDesconocido(carga.zona);
      // Desarmar no se puede llamar "armado rápido": se dice que no hubo código
      const sinCodigo = !quien && sinCodigoDeUsuario(carga.zona);
      const resto = `${lugar}${quien ? ` por ${quien}` : sinCodigo ? ' sin código de usuario' : ''}`;
      return armar(carga, { titulo: 'Sistema desarmado', cuerpo: `Desarmado${resto}`, texto: `Sistema desarmado${resto}`, tono: 'estado' });
    }
    case 'alarma': {
      const emergencia = EMERGENCIAS[codigoCid(codigo)];
      if (emergencia || carga.prioridad <= 1) {
        const que = `${emergencia ?? sinPrefijo(carga.descripcion).toLowerCase()}${lugar}`;
        return armar(carga, { titulo: 'EMERGENCIA', cuerpo: mayuscula(que), texto: `Emergencia: ${que}`, tono: 'emergencia' });
      }
      const zona = zonaHablada(carga);
      const detalle = zona ? '' : `: ${sinPrefijo(carga.descripcion)}`;
      return armar(carga, { titulo: 'ALARMA', cuerpo: `Alarma${zona}${lugar}${detalle}`, tono: 'alarma' });
    }
    case 'cancelacion':
      return armar(carga, { titulo: 'Alarma cancelada', cuerpo: `Alarma cancelada${lugar}`, tono: 'bien' });
    case 'restauracion': {
      // "Restauración de electricidad en Gerald's Café"; con prefijo genérico ("Restauración: Robo") se dice como restablecido
      const vuelve = AVERIAS_PARA_EL_CLIENTE[codigo] ?? carga.descripcion;
      const natural = !/^[^:]{1,30}:\s/.test(vuelve);
      if (natural) return armar(carga, { titulo: vuelve, cuerpo: `${vuelve}${zonaHablada(carga)}${lugar}`, tono: 'bien' });
      const que = `${sinPrefijo(vuelve)}${zonaHablada(carga)}${lugar}`;
      return armar(carga, { titulo: 'Restablecido', cuerpo: que, texto: `Restablecido: ${que}`, tono: 'bien' });
    }
    case 'averia': {
      const que = `${AVERIAS_PARA_EL_CLIENTE[codigo] ?? carga.descripcion}${zonaHablada(carga)}${lugar}`;
      return armar(carga, { titulo: 'Aviso', cuerpo: que, texto: `Aviso: ${que}`, tono: 'aviso' });
    }
    case 'anulacion': {
      // "Zona 7 anulada", no "Zona anulada en zona 7"
      const numero = Number(carga.zona);
      const cual =
        carga.zona && Number.isFinite(numero) && numero > 0
          ? `Zona ${numero}${carga.zonaDescripcion ? `, ${carga.zonaDescripcion},` : ''} anulada`
          : 'Zona anulada';
      return armar(carga, { titulo: 'Zona anulada', cuerpo: `${cual}${lugar}`, tono: 'aviso' });
    }
    default: {
      // Avisos del sistema (motor, receptor): los de prioridad máxima suenan como alarma y no se apagan
      const que = `${carga.descripcion}${lugar}`;
      const grave = carga.prioridad <= 1;
      return armar(carga, { titulo: 'Aviso de la central', cuerpo: que, texto: `Aviso de la central: ${que}`, tono: grave ? 'alarma' : 'aviso', persistente: carga.prioridad <= 2 });
    }
  }
}


/**
 * Lo que se le dice al PERSONAL de la central en el teléfono. Es otro oficio
 * y por eso es otro texto: el operador no necesita que le endulcen nada,
 * necesita la cuenta, el sitio y qué pasó, en ese orden, para decidir si
 * corre a la consola.
 *
 * A propósito devuelve null para casi todo: al personal solo se le interrumpe
 * por lo que no puede esperar. El resto lo ve en la cola.
 */
export function fraseParaPersonal(carga: CargaAviso & { numeroCuenta?: string | null; prefijo?: string | null }): Frase | null {
  const cuenta = carga.numeroCuenta ? (carga.prefijo ? `${carga.prefijo}-${carga.numeroCuenta}` : carga.numeroCuenta) : '';
  const donde = [cuenta, carga.sitioNombre].filter(Boolean).join(' ');
  const zona = zonaHablada(carga);
  const codigo = carga.codigo ?? '';

  /*
   * Fallas de la propia central: lo más grave, porque dejamos de ver. La
   * descripción que se guarda empieza por su propio rótulo ("PUENTE CAÍDO:
   * ..."), que en la consola sirve y en el teléfono repetiría el título; acá
   * se le quita. En voz tampoco se leen las mayúsculas, que el sintetizador
   * deletrea.
   */
  const deSistema = mayuscula(sinPrefijo(carga.descripcion));
  if (codigo === 'SIS-GEN') {
    return { titulo: 'CENTRAL MUDA', cuerpo: deSistema, texto: `Atención. ${deSistema}`, tono: 'alarma', persistente: true, canal: 'alarmas', grupo: null };
  }
  if (codigo === 'BRIDGE') {
    return { titulo: 'PUENTE CAÍDO', cuerpo: deSistema, texto: `Atención. ${deSistema}`, tono: 'alarma', persistente: true, canal: 'alarmas', grupo: null };
  }
  if (codigo === 'BRIDGE-R') {
    return { titulo: 'Puente restablecido', cuerpo: deSistema, texto: deSistema, tono: 'bien', persistente: false, canal: 'avisos', grupo: null };
  }
  if (codigo === 'SIS') {
    return { titulo: 'Panel silencioso', cuerpo: `${donde}: ${sinPrefijo(carga.descripcion)}`, texto: `Panel silencioso en ${donde}`, tono: 'aviso', persistente: false, canal: 'avisos', grupo: null };
  }

  // Emergencias de un cliente: pánico, incendio, coacción, médica
  if (carga.categoria === 'alarma') {
    const emergencia = EMERGENCIAS[codigoCid(codigo)];
    if (!emergencia && carga.prioridad > 1) return null;
    const que = emergencia ?? sinPrefijo(carga.descripcion).toLowerCase();
    return {
      titulo: 'EMERGENCIA',
      cuerpo: `${donde}: ${que}${zona}`,
      texto: `Emergencia en ${donde}: ${que}${zona}`,
      tono: 'emergencia',
      persistente: true,
      canal: 'alarmas',
      grupo: null,
    };
  }

  return null;
}
