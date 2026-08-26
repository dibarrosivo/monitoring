export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: 'admin' | 'operador';
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
}

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
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
  cliente: { id: number; nombre: string; telefono: string | null } | null;
  sitio: { id: number; nombre: string; direccion: string | null } | null;
  panel: { id: number; numeroCuenta: string; tipo: string; modelo: string | null } | null;
  contactos: Contacto[];
  zonaDescripcion: string | null;
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
