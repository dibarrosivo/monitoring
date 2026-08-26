export interface UsuarioApp {
  id: number;
  email: string;
  nombre: string;
  rol: string;
}

export interface PanelResumen {
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

export interface Resumen {
  paneles: PanelResumen[];
}

export interface EventoApp {
  id: number;
  categoria: string;
  codigo: string;
  descripcion: string;
  zona: string | null;
  zonaDescripcion: string | null;
  ocurridoEn: string;
}

export interface AlarmaApp {
  id: number;
  estado: string;
  prioridad: number;
  creadoEn: string;
  descripcion: string;
  codigo: string;
  panelId: number | null;
}

const CLAVE_SERVIDOR = 'app.servidor';
const CLAVE_TOKEN = 'app.token';
const CLAVE_USUARIO = 'app.usuario';

/** URL del servidor de la central. Vacío = mismo origen (desarrollo en navegador). */
export function servidorGuardado(): string {
  return localStorage.getItem(CLAVE_SERVIDOR) ?? '';
}
export function guardarServidor(url: string): void {
  localStorage.setItem(CLAVE_SERVIDOR, url.replace(/\/+$/, ''));
}
export function tokenGuardado(): string | null {
  return localStorage.getItem(CLAVE_TOKEN);
}
export function usuarioGuardado(): UsuarioApp | null {
  const crudo = localStorage.getItem(CLAVE_USUARIO);
  return crudo ? (JSON.parse(crudo) as UsuarioApp) : null;
}
export function cerrarSesion(): void {
  localStorage.removeItem(CLAVE_TOKEN);
  localStorage.removeItem(CLAVE_USUARIO);
  window.location.reload();
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const token = tokenGuardado();
  const respuesta = await fetch(`${servidorGuardado()}/api${ruta}`, {
    ...opciones,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  });
  if (respuesta.status === 401 && token) {
    cerrarSesion();
    throw new Error('Sesión vencida');
  }
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof cuerpo?.error === 'string' ? cuerpo.error : `Error ${respuesta.status}`);
  }
  return respuesta.json() as Promise<T>;
}

export async function ingresar(email: string, clave: string): Promise<UsuarioApp> {
  const datos = await pedir<{ token: string; usuario: UsuarioApp }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, clave }),
  });
  if (datos.usuario.rol !== 'cliente') {
    throw new Error('Esta app es para clientes; el personal usa la consola');
  }
  localStorage.setItem(CLAVE_TOKEN, datos.token);
  localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
  return datos.usuario;
}

export const verResumen = () => pedir<Resumen>('/cliente/resumen');
export const verEventos = () => pedir<EventoApp[]>('/cliente/eventos?limite=100');
export const verAlarmas = () => pedir<AlarmaApp[]>('/cliente/alarmas');
export const cambiarClave = (actual: string, nueva: string) =>
  pedir<{ ok: boolean }>('/auth/clave', { method: 'POST', body: JSON.stringify({ actual, nueva }) });
export const enviarPanico = (sitioId: number) =>
  pedir<{ alarmaId: number; recibido: boolean }>('/cliente/panico', {
    method: 'POST',
    body: JSON.stringify({ sitioId }),
  });
