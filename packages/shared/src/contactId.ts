import type { CategoriaEvento, EventoNormalizado } from './tipos.js';

type TipoCodigo = 'alarma' | 'averia' | 'apertura_cierre' | 'anulacion' | 'prueba' | 'cancelacion';

interface DefinicionCodigo {
  descripcion: string;
  tipo: TipoCodigo;
  /** Prioridad del evento nuevo (calificador 1). Si falta, se usa la del tipo. */
  prioridad?: number;
}

const PRIORIDAD_POR_TIPO: Record<TipoCodigo, number> = {
  alarma: 2,
  averia: 3,
  apertura_cierre: 4,
  anulacion: 4,
  prueba: 5,
  cancelacion: 2,
};

/**
 * Códigos Contact ID (SIA DC-05) más comunes. La tabla no es exhaustiva:
 * los códigos desconocidos se clasifican por rango en interpretarCid().
 */
export const TABLA_CID: Record<string, DefinicionCodigo> = {
  '100': { descripcion: 'Emergencia médica', tipo: 'alarma', prioridad: 1 },
  '101': { descripcion: 'Emergencia personal', tipo: 'alarma', prioridad: 1 },
  '110': { descripcion: 'Incendio', tipo: 'alarma', prioridad: 1 },
  '111': { descripcion: 'Detector de humo', tipo: 'alarma', prioridad: 1 },
  '112': { descripcion: 'Combustión', tipo: 'alarma', prioridad: 1 },
  '113': { descripcion: 'Flujo de agua (rociadores)', tipo: 'alarma', prioridad: 1 },
  '114': { descripcion: 'Detector de calor', tipo: 'alarma', prioridad: 1 },
  '115': { descripcion: 'Pulsador de incendio', tipo: 'alarma', prioridad: 1 },
  '117': { descripcion: 'Detector de llama', tipo: 'alarma', prioridad: 1 },
  '120': { descripcion: 'Pánico', tipo: 'alarma', prioridad: 1 },
  '121': { descripcion: 'Coacción', tipo: 'alarma', prioridad: 1 },
  '122': { descripcion: 'Pánico silencioso', tipo: 'alarma', prioridad: 1 },
  '123': { descripcion: 'Pánico audible', tipo: 'alarma', prioridad: 1 },
  '130': { descripcion: 'Robo', tipo: 'alarma' },
  '131': { descripcion: 'Robo perímetro', tipo: 'alarma' },
  '132': { descripcion: 'Robo interior', tipo: 'alarma' },
  '133': { descripcion: 'Robo 24 horas', tipo: 'alarma' },
  '134': { descripcion: 'Robo entrada/salida', tipo: 'alarma' },
  '135': { descripcion: 'Robo día/noche', tipo: 'alarma' },
  '136': { descripcion: 'Robo exterior', tipo: 'alarma' },
  '137': { descripcion: 'Sabotaje (tamper)', tipo: 'alarma' },
  '139': { descripcion: 'Robo verificado', tipo: 'alarma', prioridad: 1 },
  '140': { descripcion: 'Alarma general', tipo: 'alarma' },
  '144': { descripcion: 'Sabotaje de sensor', tipo: 'alarma' },
  '145': { descripcion: 'Sabotaje de módulo', tipo: 'alarma' },
  '146': { descripcion: 'Robo silencioso', tipo: 'alarma' },
  '150': { descripcion: 'Alarma 24 horas (no robo)', tipo: 'alarma' },
  '151': { descripcion: 'Detección de gas', tipo: 'alarma', prioridad: 1 },
  '154': { descripcion: 'Fuga de agua', tipo: 'alarma' },
  '158': { descripcion: 'Temperatura alta', tipo: 'alarma' },
  '159': { descripcion: 'Temperatura baja', tipo: 'alarma' },
  '162': { descripcion: 'Monóxido de carbono', tipo: 'alarma', prioridad: 1 },

  '300': { descripcion: 'Avería de sistema', tipo: 'averia' },
  '301': { descripcion: 'Falla de red eléctrica', tipo: 'averia' },
  '302': { descripcion: 'Batería baja', tipo: 'averia' },
  '305': { descripcion: 'Reinicio del sistema', tipo: 'averia' },
  '306': { descripcion: 'Cambio de programación', tipo: 'averia' },
  '311': { descripcion: 'Batería ausente', tipo: 'averia' },
  '321': { descripcion: 'Avería de sirena', tipo: 'averia' },
  '330': { descripcion: 'Avería de periférico', tipo: 'averia' },
  '333': { descripcion: 'Falla de módulo de expansión', tipo: 'averia' },
  '344': { descripcion: 'Interferencia RF (jamming)', tipo: 'averia' },
  '350': { descripcion: 'Avería de comunicación', tipo: 'averia' },
  '351': { descripcion: 'Falla línea telefónica 1', tipo: 'averia' },
  '354': { descripcion: 'Falla al comunicar evento', tipo: 'averia' },
  '370': { descripcion: 'Avería de zona de protección', tipo: 'averia' },
  '373': { descripcion: 'Avería de detector de incendio', tipo: 'averia' },
  '374': { descripcion: 'Error de salida (armado con zona abierta)', tipo: 'averia' },
  '380': { descripcion: 'Avería de sensor', tipo: 'averia' },
  '381': { descripcion: 'Pérdida de supervisión RF', tipo: 'averia' },
  '383': { descripcion: 'Sabotaje de sensor', tipo: 'averia' },
  '384': { descripcion: 'Batería baja de sensor RF', tipo: 'averia' },

  '400': { descripcion: 'Apertura/Cierre', tipo: 'apertura_cierre' },
  '401': { descripcion: 'Apertura/Cierre por usuario', tipo: 'apertura_cierre' },
  '403': { descripcion: 'Armado automático', tipo: 'apertura_cierre' },
  '406': { descripcion: 'Cancelación por usuario', tipo: 'cancelacion' },
  '407': { descripcion: 'Armado/Desarmado remoto', tipo: 'apertura_cierre' },
  '408': { descripcion: 'Armado rápido', tipo: 'apertura_cierre' },
  '409': { descripcion: 'Armado por llave', tipo: 'apertura_cierre' },
  '441': { descripcion: 'Armado en modo presente', tipo: 'apertura_cierre' },
  '456': { descripcion: 'Armado parcial', tipo: 'apertura_cierre' },
  '459': { descripcion: 'Cierre reciente', tipo: 'apertura_cierre' },

  '570': { descripcion: 'Anulación de zona (bypass)', tipo: 'anulacion' },
  '574': { descripcion: 'Anulación de grupo', tipo: 'anulacion' },

  '601': { descripcion: 'Prueba manual', tipo: 'prueba' },
  '602': { descripcion: 'Prueba periódica', tipo: 'prueba' },
  '607': { descripcion: 'Modo de prueba de paseo', tipo: 'prueba' },
  '608': { descripcion: 'Prueba periódica con avería presente', tipo: 'averia' },
  '621': { descripcion: 'Reinicio de registro de eventos', tipo: 'averia' },
  '625': { descripcion: 'Fecha/hora reprogramada', tipo: 'averia' },
  '627': { descripcion: 'Entrada a modo programación', tipo: 'averia' },
  '628': { descripcion: 'Salida de modo programación', tipo: 'averia' },
};

function tipoPorRango(codigo: string): TipoCodigo {
  const n = Number(codigo);
  if (n >= 100 && n < 200) return 'alarma';
  if (n >= 200 && n < 300) return 'averia'; // supervisión de incendio
  if (n >= 300 && n < 400) return 'averia';
  if (n >= 400 && n < 500) return 'apertura_cierre';
  if (n >= 500 && n < 600) return 'anulacion';
  if (n >= 600 && n < 700) return 'prueba';
  return 'averia';
}

function categoriaPara(tipo: TipoCodigo, calificador: 1 | 3 | 6): CategoriaEvento {
  if (tipo === 'apertura_cierre') return calificador === 3 ? 'cierre' : 'apertura';
  if (calificador === 3) return 'restauracion';
  switch (tipo) {
    case 'alarma': return 'alarma';
    case 'averia': return 'averia';
    case 'anulacion': return 'anulacion';
    case 'prueba': return 'prueba';
    case 'cancelacion': return 'cancelacion';
  }
}

/** Interpreta un evento Contact ID ya extraído de la trama. */
export function interpretarCid(entrada: {
  numeroCuenta: string;
  calificador: 1 | 3 | 6;
  codigoCid: string;
  particion: string;
  zona: string;
  ocurridoEn?: Date;
}): EventoNormalizado {
  const def = TABLA_CID[entrada.codigoCid];
  const tipo = def?.tipo ?? tipoPorRango(entrada.codigoCid);
  const categoria = categoriaPara(tipo, entrada.calificador);
  const base = def?.descripcion ?? `Código CID ${entrada.codigoCid}`;

  let descripcion = base;
  if (categoria === 'restauracion') descripcion = `Restauración: ${base}`;
  else if (categoria === 'apertura') descripcion = `Apertura (desarmado): ${base}`;
  else if (categoria === 'cierre') descripcion = `Cierre (armado): ${base}`;
  if (entrada.calificador === 6) descripcion += ' (evento previo aún activo)';

  const prioridadNueva = def?.prioridad ?? PRIORIDAD_POR_TIPO[tipo];

  return {
    numeroCuenta: entrada.numeroCuenta,
    calificador: entrada.calificador,
    codigoCid: entrada.codigoCid,
    codigo: `${entrada.calificador === 3 ? 'R' : 'E'}${entrada.codigoCid}`,
    particion: entrada.particion,
    zona: entrada.zona,
    categoria,
    descripcion,
    prioridad: categoria === 'restauracion' || categoria === 'cierre' || categoria === 'apertura' ? 4 : prioridadNueva,
    ocurridoEn: entrada.ocurridoEn,
  };
}
