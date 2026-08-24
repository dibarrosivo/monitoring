export type FuenteSenal = 'dc09-tcp' | 'dc09-udp' | 'pima-bridge' | 'simulador';

export type CategoriaEvento =
  | 'alarma'
  | 'restauracion'
  | 'apertura'
  | 'cierre'
  | 'averia'
  | 'anulacion'
  | 'prueba'
  | 'cancelacion'
  | 'sistema'
  | 'desconocido';

/** Evento ya decodificado, independiente del protocolo de origen. */
export interface EventoNormalizado {
  numeroCuenta: string;
  /** 1 = evento nuevo, 3 = restauración/cierre, 6 = evento previo aún activo */
  calificador: 1 | 3 | 6;
  /** Código Contact ID de 3 dígitos, p. ej. '130' */
  codigoCid: string;
  /** Código con prefijo E/R, p. ej. 'E130' */
  codigo: string;
  particion: string;
  /** Zona o número de usuario según el código */
  zona: string;
  categoria: CategoriaEvento;
  descripcion: string;
  /** 1 = máxima (fuego/pánico/médica), 5 = mínima (pruebas) */
  prioridad: number;
  /** Fecha/hora incluida en la trama; si falta, el servidor usa la hora de recepción */
  ocurridoEn?: Date;
}

/** Trama cruda recibida por cualquier listener, antes de decodificar. */
export interface SenalCruda {
  fuente: FuenteSenal;
  /** ip:puerto del emisor, o id del bridge */
  remoto: string;
  cruda: string;
  recibidaEn: Date;
}
