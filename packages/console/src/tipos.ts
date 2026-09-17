export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: 'admin' | 'supervisor' | 'operador' | 'cliente';
}

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

export interface Evento {
  id: number;
  senalId: number | null;
  panelId: number | null;
  numeroCuenta: string | null;
  prefijo?: string | null;
  categoria: CategoriaEvento;
  codigo: string;
  descripcion: string;
  particion: string | null;
  zona: string | null;
  prioridad: number;
  ocurridoEn: string;
  zonaDescripcion?: string | null;
  clienteNombre?: string | null;
}

export interface Senal {
  id: number;
  fuente: string;
  remoto: string | null;
  cruda: string;
  estadoParse: string;
  detalleError: string | null;
  panelId: number | null;
  recibidaEn: string;
  numeroCuenta?: string | null;
  prefijo?: string | null;
  clienteNombre?: string | null;
}

export interface Zona {
  id: number;
  panelId: number;
  numero: string;
  particion: string;
  descripcion: string | null;
}

export interface Horario {
  id: number;
  panelId: number;
  dias: string;
  apertura: string;
  cierre: string;
  toleranciaMin: number;
  activo: boolean;
}

export interface UsuarioAdmin {
  id: number;
  email: string;
  nombre: string;
  rol: 'admin' | 'supervisor' | 'operador' | 'cliente';
  activo: boolean;
  creadoEn: string;
}

/** Permiso de un usuario de app: cliente entero, un sitio o un panel puntual. */
export interface Acceso {
  id: number;
  clienteId: number;
  clienteNombre: string;
  sitioId: number | null;
  sitioNombre: string | null;
  panelId: number | null;
  panelCuenta: string | null;
}

/** Usuario del panel físico: código del teclado con nombre. */
export interface UsuarioPanel {
  id: number;
  panelId: number;
  numero: string;
  nombre: string;
  telefono: string | null;
  contactoId: number | null;
}

export type EstadoAlarma = 'nueva' | 'en_atencion' | 'cerrada';

export interface Alarma {
  id: number;
  estado: EstadoAlarma;
  prioridad: number;
  operadorId: number | null;
  creadoEn: string;
  tomadaEn: string | null;
  cerradaEn: string | null;
  desenlace: DesenlaceAlarma | null;
  motivo: string | null;
  resolucion: string | null;
  /** Quién la tiene o la cerró */
  operadorNombre: string | null;
  panelId: number | null;
  zonaDescripcion: string | null;
  clienteNombre: string | null;
  prefijo?: string | null;
  evento: Pick<Evento, 'id' | 'codigo' | 'categoria' | 'descripcion' | 'numeroCuenta' | 'particion' | 'zona' | 'ocurridoEn'> & {
    senalId: number | null;
  };
}

export type TipoAccionAlarma = 'toma' | 'nota' | 'cierre' | 'sistema' | 'paso' | 'llamada';

export interface AccionAlarma {
  id: number;
  alarmaId: number;
  operadorId: number | null;
  operadorNombre: string | null;
  tipo: TipoAccionAlarma;
  detalle: string | null;
  creadoEn: string;
}

export interface EstadoPanel {
  id: number;
  sitioId: number;
  numeroCuenta: string;
  tipo: 'hikvision' | 'pima' | 'ebs' | 'otro';
  supervisado: boolean;
  intervaloPruebaMin: number;
  ultimaSenalEn: string | null;
  activo: boolean;
  cuentaSecundaria?: string | null;
  prefijo?: string | null;
  alias?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serial?: string | null;
  claveMaestra?: string | null;
  instalador?: string | null;
  fechaInstalacion?: string | null;
  propiedad?: PropiedadEquipo;
  montoAbono?: string | null;
  frecuenciaMeses?: number;
  proximoVencimiento?: string | null;
  /** Presentes solo en /paneles/estado (la lista enriquecida) */
  sitioNombre?: string;
  clienteId?: number;
  clienteNombre?: string;
  estadoArmado?: 'armado' | 'desarmado' | 'desconocido';
  ultimoMovimientoEn?: string | null;
}

/** Fila de la lista de clientes con su resumen a simple vista. */
export interface ClienteResumen extends Cliente {
  sitios: number;
  dispositivos: number;
  silenciosos: number;
  alarmasAbiertas: number;
  vencidos: number;
  proximoVencimiento: string | null;
  abonoTotal: string | null;
}

export interface Puente {
  id: number;
  nombre: string;
  descripcion: string | null;
  fuente: string | null;
  version: string | null;
  ultimoLatidoEn: string | null;
  tramasRecibidas: number;
  supervisado: boolean;
  intervaloLatidoSeg: number;
  activo: boolean;
  silencioso: boolean;
}

/** Una línea del diario de un puente: la trama cruda y, si se entendió, su evento. */
export interface LineaDiarioPuente {
  id: number;
  recibidaEn: string;
  cruda: string;
  estadoParse: string;
  detalleError: string | null;
  panelId: number | null;
  codigo: string | null;
  descripcion: string | null;
  categoria: CategoriaEvento | null;
  numeroCuenta: string | null;
  prefijo?: string | null;
  prioridad: number | null;
}

export interface DiarioPuente {
  resumen: { ultimas24h: number; sinInterpretar24h: number; ultimaTramaEn: string | null };
  senales: LineaDiarioPuente[];
}

export interface Feriado {
  id: number;
  fecha: string;
  descripcion: string | null;
}

export interface RegistroAuditoria {
  id: number;
  entidad: string;
  entidadId: number | null;
  accion: string;
  cambios: Record<string, unknown> | null;
  creadoEn: string;
  usuarioNombre: string | null;
}

export type EstadoCliente = 'activo' | 'suspendido' | 'baja';
export type TipoPersona = 'natural' | 'juridico' | 'gobierno' | 'otro';
export type TipoSitio =
  | 'residencial'
  | 'comercial'
  | 'industria'
  | 'gobierno'
  | 'apartamento'
  | 'centro_comercial'
  | 'otro';
export type PropiedadEquipo = 'propio' | 'comodato' | 'prestamo';

export interface Cliente {
  id: number;
  nombre: string;
  documento: string | null;
  tipoPersona: TipoPersona;
  telefono: string | null;
  movil: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  instrucciones: string | null;
  estado: EstadoCliente;
  motivoEstado: string | null;
  estadoDesde: string | null;
  fechaAlta: string | null;
  activo: boolean;
}

export interface Sitio {
  id: number;
  clienteId: number;
  nombre: string;
  tipo: TipoSitio;
  direccion: string | null;
  ciudad: string | null;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
  telefono: string | null;
  zonaHoraria: string | null;
  llaves: string | null;
  puntoTag: string | null;
  instruccionesAcceso: string | null;
  instrucciones: string | null;
  notas: string | null;
}

export interface Contacto {
  id: number;
  clienteId: number;
  sitioId: number | null;
  nombre: string;
  rol: string | null;
  telefono: string;
  telefonoAlternativo: string | null;
  email: string | null;
  orden: number;
  palabraClave: string | null;
  autorizadoCancelar: boolean;
  notas: string | null;
}

export interface ClienteDetalle extends Cliente {
  sitios: Sitio[];
  contactos: Contacto[];
}

/** Contexto de una alarma para el panel de detalle. */
export interface ContextoAlarma {
  cliente: {
    id: number;
    nombre: string;
    telefono: string | null;
    instrucciones: string | null;
    estado: EstadoCliente;
    motivoEstado: string | null;
  } | null;
  sitio: {
    id: number;
    nombre: string;
    tipo: TipoSitio;
    direccion: string | null;
    ciudad: string | null;
    referencia: string | null;
    latitud: number | null;
    longitud: number | null;
    telefono: string | null;
    llaves: string | null;
    instruccionesAcceso: string | null;
    instrucciones: string | null;
  } | null;
  panel: {
    id: number;
    numeroCuenta: string;
    prefijo?: string | null;
    alias: string | null;
    tipo: string;
    marca: string | null;
    modelo: string | null;
    claveMaestra: string | null;
  } | null;
  contactos: Contacto[];
  zonaDescripcion: string | null;
  /** Pasos sugeridos para este tipo de evento */
  pasos: string[];
  /** Cuáles ya se marcaron; se deducen de la bitácora, no se guardan aparte */
  pasosCumplidos: string[];
}

/** Cómo terminó una alarma. Separado del texto libre para poder medirlo. */
export type DesenlaceAlarma = 'resuelta' | 'falsa_alarma' | 'escalada';

/** Resumen para la vista de clientes (rol 'cliente'). */
export interface PanelResumenCliente {
  id: number;
  numeroCuenta: string;
  prefijo?: string | null;
  tipo: string;
  activo: boolean;
  ultimaSenalEn: string | null;
  sitioId: number;
  sitioNombre: string;
  sitioDireccion: string | null;
  clienteId: number;
  clienteNombre: string;
  estadoArmado: 'armado' | 'desarmado' | 'desconocido';
  ultimoMovimientoEn: string | null;
}

export interface ResumenCliente {
  paneles: PanelResumenCliente[];
}

export interface EventoCliente {
  id: number;
  panelId: number | null;
  categoria: CategoriaEvento;
  codigo: string;
  descripcion: string;
  zona: string | null;
  zonaDescripcion: string | null;
  ocurridoEn: string;
}

export interface AlarmaCliente {
  id: number;
  estado: string;
  prioridad: number;
  creadoEn: string;
  descripcion: string;
  codigo: string;
  panelId: number | null;
}

export interface ConfigHombreMuerto {
  activo: boolean;
  intervaloMin: number;
  respuestaSeg: number;
}

export interface Reporte {
  cliente: { id: number; nombre: string };
  periodo: { desde: string; hasta: string };
  paneles: { id: number; numeroCuenta: string; sitioNombre: string }[];
  totalesPorCategoria: { categoria: CategoriaEvento; cantidad: number }[];
  alarmas: {
    id: number;
    estado: EstadoAlarma;
    prioridad: number;
    creadoEn: string;
    tomadaEn: string | null;
    cerradaEn: string | null;
    resolucion: string | null;
    codigo: string;
    descripcion: string;
    numeroCuenta: string | null;
    prefijo?: string | null;
  }[];
  eventos: {
    id: number;
    codigo: string;
    categoria: CategoriaEvento;
    descripcion: string;
    numeroCuenta: string | null;
    prefijo?: string | null;
    zona: string | null;
    particion: string | null;
    ocurridoEn: string;
  }[];
  estadisticas: {
    totalEventos: number;
    totalAlarmas: number;
    respuestaMediaSeg: number | null;
    cierreMedioSeg: number | null;
  };
}

/** Resumen operativo del tablero de administración. */
export interface Tablero {
  alarmas: { nuevas: number; enAtencion: number; cerradasHoy: number };
  paneles: { activos: number; silenciosos: number };
  clientes: { activos: number };
  hoy: { senales: number; eventos: number };
  facturacion: {
    vencidos: number;
    porVencer: number;
    cuentas: {
      panelId: number;
      numeroCuenta: string;
      prefijo?: string | null;
      clienteNombre: string;
      proximoVencimiento: string | null;
      montoAbono: string | null;
    }[];
  };
  eventosHoyPorCategoria: { categoria: CategoriaEvento; cantidad: number }[];
  ultimasAlarmas: {
    id: number;
    estado: EstadoAlarma;
    prioridad: number;
    creadoEn: string;
    codigo: string;
    descripcion: string;
    numeroCuenta: string | null;
    prefijo?: string | null;
    clienteNombre: string | null;
  }[];
}

/** Resultados de la búsqueda global, agrupados por entidad. */
export interface ResultadoBusqueda {
  clientes: { id: number; nombre: string; telefono: string | null }[];
  sitios: { id: number; nombre: string; direccion: string | null; clienteId: number }[];
  paneles: { id: number; numeroCuenta: string; prefijo?: string | null; tipo: string; clienteId: number; sitioNombre: string }[];
  contactos: { id: number; nombre: string; telefono: string; clienteId: number }[];
}

/** Mensajes que llegan por el WebSocket (NOTIFY de Postgres). */
export interface MensajeTiempoReal {
  canal: 'nueva_alarma' | 'nuevo_evento';
  carga: {
    alarmaId?: number;
    eventoId: number;
    panelId: number | null;
    prioridad: number;
    descripcion: string;
    codigo?: string;
    categoria?: CategoriaEvento;
    numeroCuenta?: string | null;
    prefijo?: string | null;
    /** Para decirlo en voz alta: zona física, su nombre y el sitio */
    zona?: string | null;
    zonaDescripcion?: string | null;
    sitioNombre?: string | null;
  };
}

/** Valor sugerido para un campo libre del equipo (marca, modelo, instalador). */
export interface EntradaCatalogo {
  tipo: string;
  valor: string;
}

export type AccionComando = 'armar' | 'armar_casa' | 'desarmar';
export type EstadoComando = 'pendiente' | 'enviado' | 'confirmado' | 'fallido';

/** Un comando enviado a un panel, con lo que pasó después. */
export interface Comando {
  id: number;
  accion: AccionComando;
  particion: string;
  estado: EstadoComando;
  detalle: string | null;
  creadoEn: string;
  resueltoEn: string | null;
  usuarioId: number | null;
}

/** Estado de una partición según el propio panel. */
export interface EstadoParticion {
  particion: number;
  nombre?: string;
  habilitada: boolean;
  estado: 'desarmado' | 'armado' | 'armado_casa' | 'armando';
  enAlarma: boolean;
}

export interface EstadoZonaPanel {
  numero: number;
  nombre: string;
  estado: 'normal' | 'activa' | 'anulada' | 'sabotaje' | 'sin_conexion' | 'falla';
  armada: boolean;
  enAlarma: boolean;
  tipo?: string;
  /** Descripción cargada en la central, si difiere del nombre del panel */
  descripcion: string | null;
}

/** Todo lo que el panel sabe decir de sí mismo (Hikvision). */
export interface EstadoDetalladoPanel {
  particiones: EstadoParticion[];
  zonas: EstadoZonaPanel[];
  bateria?: { porcentaje: number; estado: string };
  comunicaciones?: { cable?: string; wifi?: string; senalWifi?: number; nube?: string };
  perifericos: { tipo: 'sirena' | 'teclado' | 'repetidor'; nombre: string; estado: string; sabotaje: boolean }[];
}

/** Supervisión del personal (solo administradores). */
export interface OperadorSupervision {
  id: number;
  nombre: string;
  email: string;
  rol: 'admin' | 'supervisor' | 'operador';
  activo: boolean;
  tomadas: number;
  cerradas: number;
  reaccionMediaSeg: number | null;
  reaccionMaxSeg: number | null;
  atencionMediaSeg: number | null;
  desenlaces: { resuelta: number; falsa_alarma: number; escalada: number };
  motivos: { desenlace: string; motivo: string; n: number }[];
  llamadas: number;
  notas: number;
  pasos: number;
  devoluciones: number;
  hombreMuerto: number;
  sesiones: number;
  horasEnServicio: number;
  ultimaActividadEn: string | null;
  enServicio: boolean;
}

export interface AlertaSupervision {
  tipo: 'sin_tomar' | 'cierre_sin_llamada' | 'sin_actividad';
  texto: string;
  alarmaId?: number;
  usuarioId?: number;
  prioridad?: number;
}

export interface Supervision {
  periodo: { desde: string; hasta: string };
  operadores: OperadorSupervision[];
  alertas: AlertaSupervision[];
}

export interface ActividadOperador {
  operador: { id: number; nombre: string; email: string };
  periodo: { desde: string; hasta: string };
  acciones: {
    id: number;
    creadoEn: string;
    tipo: TipoAccionAlarma;
    detalle: string | null;
    alarmaId: number;
    codigo: string;
    descripcion: string;
    numeroCuenta: string | null;
    prefijo: string | null;
    clienteNombre: string | null;
  }[];
  sesiones: { id: number; ingresoEn: string; ultimaActividadEn: string; ip: string | null; agente: string | null }[];
  hombreMuerto: { id: number; ocurridoEn: string; descripcion: string }[];
}
