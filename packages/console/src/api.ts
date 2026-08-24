import type {
  AccionAlarma,
  Alarma,
  Cliente,
  ClienteDetalle,
  Contacto,
  ContextoAlarma,
  EstadoPanel,
  Evento,
  Usuario,
} from './tipos.js';

const CLAVE_TOKEN = 'monitoring.token';
const CLAVE_USUARIO = 'monitoring.usuario';

export function tokenGuardado(): string | null {
  return localStorage.getItem(CLAVE_TOKEN);
}

export function usuarioGuardado(): Usuario | null {
  const crudo = localStorage.getItem(CLAVE_USUARIO);
  return crudo ? (JSON.parse(crudo) as Usuario) : null;
}

export function cerrarSesion(): void {
  localStorage.removeItem(CLAVE_TOKEN);
  localStorage.removeItem(CLAVE_USUARIO);
  window.location.reload();
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const token = tokenGuardado();
  const respuesta = await fetch(`/api${ruta}`, {
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

export async function ingresar(email: string, clave: string): Promise<Usuario> {
  const datos = await pedir<{ token: string; usuario: Usuario }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, clave }),
  });
  localStorage.setItem(CLAVE_TOKEN, datos.token);
  localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
  return datos.usuario;
}

export const listarAlarmas = () => pedir<Alarma[]>('/alarmas');
export const listarAcciones = (alarmaId: number) => pedir<AccionAlarma[]>(`/alarmas/${alarmaId}/acciones`);
export const verContexto = (alarmaId: number) => pedir<ContextoAlarma>(`/alarmas/${alarmaId}/contexto`);
export const tomarAlarma = (id: number) => pedir<Alarma>(`/alarmas/${id}/tomar`, { method: 'POST' });
export const anotarAlarma = (id: number, detalle: string) =>
  pedir<AccionAlarma>(`/alarmas/${id}/notas`, { method: 'POST', body: JSON.stringify({ detalle }) });
export const cerrarAlarma = (id: number, resolucion: string) =>
  pedir<Alarma>(`/alarmas/${id}/cerrar`, { method: 'POST', body: JSON.stringify({ resolucion }) });

export const listarEventos = (limite = 200) => pedir<Evento[]>(`/eventos?limite=${limite}`);
export const listarPaneles = () => pedir<EstadoPanel[]>('/paneles/estado');

export const listarClientes = () => pedir<Cliente[]>('/clientes');
export const verCliente = (id: number) => pedir<ClienteDetalle>(`/clientes/${id}`);
export const crearCliente = (datos: { nombre: string; telefono?: string; direccion?: string }) =>
  pedir<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(datos) });
export const crearSitio = (datos: { clienteId: number; nombre: string; direccion?: string }) =>
  pedir<{ id: number }>('/sitios', { method: 'POST', body: JSON.stringify(datos) });
export const crearPanel = (datos: {
  sitioId: number;
  numeroCuenta: string;
  tipo: 'hikvision' | 'pima' | 'ebm' | 'otro';
  modelo?: string;
  intervaloPruebaMin?: number;
}) => pedir<EstadoPanel>('/paneles', { method: 'POST', body: JSON.stringify(datos) });
export const crearContacto = (datos: {
  clienteId: number;
  sitioId?: number;
  nombre: string;
  telefono: string;
  orden?: number;
  palabraClave?: string;
}) => pedir<Contacto>('/contactos', { method: 'POST', body: JSON.stringify(datos) });
