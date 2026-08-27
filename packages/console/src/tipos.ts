export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: 'admin' | 'operador' | 'cliente';
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
  rol: 'admin' | 'operador' | 'cliente';
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
  resolucion: string | null;
  panelId: number | null;
  zonaDescripcion: string | null;
  clienteNombre: string | null;
  evento: Pick<Evento, 'id' | 'codigo' | 'categoria' | 'descripcion' | 'numeroCuenta' | 'particion' | 'zona' | 'ocurridoEn'> & {
    senalId: number | null;
  };
}

export interface AccionAlarma {
  id: number;
  alarmaId: number;
  operadorId: number | null;
  tipo: 'toma' | 'nota' | 'cierre' | 'sistema';
  detalle: string | null;
  creadoEn: string;
}

export interface EstadoPanel {
  id: number;
  sitioId: number;
  numeroCuenta: string;
  tipo: 'hikvision' | 'pima' | 'ebm' | 'otro';
  supervisado: boolean;
  intervaloPruebaMin: number;
  ultimaSenalEn: string | null;
  activo: boolean;
  marca?: string | null;
  modelo?: string | null;
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
}

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  instrucciones: string | null;
  activo: boolean;
}

export interface Sitio {
  id: number;
  clienteId: number;
  nombre: string;
  direccion: string | null;
}

export interface Contacto {
  id: number;
  clienteId: number;
  sitioId: number | null;
  nombre: string;
  telefono: string;
  orden: number;
  palabraClave: string | null;
}

export interface ClienteDetalle extends Cliente {
  sitios: Sitio[];
  contactos: Contacto[];
}

/** Contexto de una alarma para el panel de detalle. */
export interface ContextoAlarma {
  cliente: { id: number; nombre: string; telefono: string | null; instrucciones: string | null } | null;
  sitio: { id: number; nombre: string; direccion: string | null } | null;
  panel: { id: number; numeroCuenta: string; tipo: string; modelo: string | null } | null;
  contactos: Contacto[];
  zonaDescripcion: string | null;
}

/** Resumen para la vista de clientes (rol 'cliente'). */
export interface PanelResumenCliente {
  id: number;
  numeroCuenta: string;
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
  }[];
  eventos: {
    id: number;
    codigo: string;
    categoria: CategoriaEvento;
    descripcion: string;
    numeroCuenta: string | null;
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
  eventosHoyPorCategoria: { categoria: CategoriaEvento; cantidad: number }[];
  ultimasAlarmas: {
    id: number;
    estado: EstadoAlarma;
    prioridad: number;
    creadoEn: string;
    codigo: string;
    descripcion: string;
    numeroCuenta: string | null;
    clienteNombre: string | null;
  }[];
}

/** Resultados de la búsqueda global, agrupados por entidad. */
export interface ResultadoBusqueda {
  clientes: { id: number; nombre: string; telefono: string | null }[];
  sitios: { id: number; nombre: string; direccion: string | null; clienteId: number }[];
  paneles: { id: number; numeroCuenta: string; tipo: string; clienteId: number; sitioNombre: string }[];
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
  };
}
