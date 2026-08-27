import type {
  Acceso,
  AccionAlarma,
  Alarma,
  AlarmaCliente,
  Cliente,
  ClienteDetalle,
  ClienteResumen,
  ConfigHombreMuerto,
  Contacto,
  ContextoAlarma,
  EstadoPanel,
  Evento,
  EventoCliente,
  Horario,
  Reporte,
  ResultadoBusqueda,
  ResumenCliente,
  Senal,
  Tablero,
  Usuario,
  UsuarioAdmin,
  UsuarioPanel,
  Zona,
} from './tipos.js';

const CLAVE_TOKEN = 'monitoring.token';
const CLAVE_USUARIO = 'monitoring.usuario';
const CLAVE_SERVIDOR = 'monitoring.servidor';

/** ¿Corre dentro del envoltorio nativo (Capacitor)? Ahí el servidor es configurable. */
export function esNativo(): boolean {
  return Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

/** URL del servidor de la central. Vacío = mismo origen (web). */
export function servidorGuardado(): string {
  return localStorage.getItem(CLAVE_SERVIDOR) ?? '';
}
export function guardarServidor(url: string): void {
  if (url.trim()) localStorage.setItem(CLAVE_SERVIDOR, url.trim().replace(/\/+$/, ''));
  else localStorage.removeItem(CLAVE_SERVIDOR);
}

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
  localStorage.removeItem(CLAVE_IMP_TOKEN);
  localStorage.removeItem(CLAVE_IMP_USUARIO);
  window.location.reload();
}

// ---- Impersonación: el admin ve la plataforma como un usuario de la app ----
const CLAVE_IMP_TOKEN = 'monitoring.imp.token';
const CLAVE_IMP_USUARIO = 'monitoring.imp.usuario';

export function impersonando(): Usuario | null {
  const crudo = localStorage.getItem(CLAVE_IMP_USUARIO);
  return crudo && localStorage.getItem(CLAVE_IMP_TOKEN) ? (JSON.parse(crudo) as Usuario) : null;
}

export function iniciarImpersonacion(datos: { token: string; usuario: Usuario }): void {
  localStorage.setItem(CLAVE_IMP_TOKEN, datos.token);
  localStorage.setItem(CLAVE_IMP_USUARIO, JSON.stringify(datos.usuario));
  window.location.reload();
}

export function salirImpersonacion(): void {
  localStorage.removeItem(CLAVE_IMP_TOKEN);
  localStorage.removeItem(CLAVE_IMP_USUARIO);
  window.location.reload();
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  // Durante una impersonación, todos los pedidos van con el token del cliente
  const tokenImp = localStorage.getItem(CLAVE_IMP_TOKEN);
  const token = tokenImp ?? tokenGuardado();
  const respuesta = await fetch(`${servidorGuardado()}/api${ruta}`, {
    ...opciones,
    headers: {
      // content-type solo cuando hay cuerpo: Fastify rechaza JSON vacío
      ...(opciones.body != null ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  });
  if (respuesta.status === 401 && token) {
    // Impersonación vencida: se vuelve a la consola sin tirar la sesión del admin
    if (tokenImp) salirImpersonacion();
    else cerrarSesion();
    throw new Error('Sesión vencida');
  }
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof cuerpo?.error === 'string' ? cuerpo.error : `Error ${respuesta.status}`);
  }
  return respuesta.json() as Promise<T>;
}

export async function ingresar(email: string, clave: string): Promise<Usuario> {
  const datos = await pedir<{ token: string; usuario: Omit<Usuario, 'rol'> & { rol: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, clave }),
  });
  localStorage.setItem(CLAVE_TOKEN, datos.token);
  localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
  return datos.usuario as Usuario;
}

export const listarAlarmas = (estado?: 'nueva' | 'en_atencion' | 'cerrada') =>
  pedir<Alarma[]>(estado ? `/alarmas?estado=${estado}` : '/alarmas');
export const listarAcciones = (alarmaId: number) => pedir<AccionAlarma[]>(`/alarmas/${alarmaId}/acciones`);
export const verContexto = (alarmaId: number) => pedir<ContextoAlarma>(`/alarmas/${alarmaId}/contexto`);
export const tomarAlarma = (id: number) => pedir<Alarma>(`/alarmas/${id}/tomar`, { method: 'POST' });
export const anotarAlarma = (id: number, detalle: string) =>
  pedir<AccionAlarma>(`/alarmas/${id}/notas`, { method: 'POST', body: JSON.stringify({ detalle }) });
export const cerrarAlarma = (id: number, resolucion: string) =>
  pedir<Alarma>(`/alarmas/${id}/cerrar`, { method: 'POST', body: JSON.stringify({ resolucion }) });

export const listarEventos = (limite = 200) => pedir<Evento[]>(`/eventos?limite=${limite}`);
export const listarPaneles = () => pedir<EstadoPanel[]>('/paneles/estado');

export const listarClientes = () => pedir<ClienteResumen[]>('/clientes');
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

export const verSenal = (id: number) => pedir<Senal>(`/senales/${id}`);
export const listarSenales = (limite = 200) => pedir<Senal[]>(`/senales?limite=${limite}`);

const editar = <T>(ruta: string, datos: unknown) =>
  pedir<T>(ruta, { method: 'PUT', body: JSON.stringify(datos) });
const eliminar = (ruta: string) => pedir<{ eliminado: boolean }>(ruta, { method: 'DELETE' });

export const editarCliente = (id: number, datos: Partial<Cliente>) => editar<Cliente>(`/clientes/${id}`, datos);
export const editarSitio = (id: number, datos: { nombre?: string; direccion?: string }) => editar(`/sitios/${id}`, datos);
export const eliminarSitio = (id: number) => eliminar(`/sitios/${id}`);
export const editarPanel = (id: number, datos: Partial<Omit<EstadoPanel, 'id' | 'sitioId' | 'ultimaSenalEn'>> & { modelo?: string }) =>
  editar<EstadoPanel>(`/paneles/${id}`, datos);
export const listarZonas = (panelId: number) => pedir<Zona[]>(`/paneles/${panelId}/zonas`);
export const crearZona = (datos: { panelId: number; numero: string; particion?: string; descripcion?: string }) =>
  pedir<Zona>('/zonas', { method: 'POST', body: JSON.stringify(datos) });
export const editarZona = (id: number, datos: { numero?: string; particion?: string; descripcion?: string }) =>
  editar<Zona>(`/zonas/${id}`, datos);
export const eliminarZona = (id: number) => eliminar(`/zonas/${id}`);
export const editarContacto = (id: number, datos: Partial<Omit<Contacto, 'id' | 'clienteId'>>) =>
  editar<Contacto>(`/contactos/${id}`, datos);
export const eliminarContacto = (id: number) => eliminar(`/contactos/${id}`);

export const listarHorarios = (panelId: number) => pedir<Horario[]>(`/paneles/${panelId}/horarios`);
export const crearHorario = (datos: { panelId: number; dias: string; apertura: string; cierre: string; toleranciaMin?: number }) =>
  pedir<Horario>('/horarios', { method: 'POST', body: JSON.stringify(datos) });
export const eliminarHorario = (id: number) => eliminar(`/horarios/${id}`);

export const listarUsuarios = (clienteId?: number) =>
  pedir<UsuarioAdmin[]>(clienteId ? `/usuarios?clienteId=${clienteId}` : '/usuarios');
export const impersonar = (usuarioId: number) =>
  pedir<{ token: string; usuario: Usuario }>(`/usuarios/${usuarioId}/impersonar`, { method: 'POST' });
export const buscar = (q: string) => pedir<ResultadoBusqueda>(`/buscar?q=${encodeURIComponent(q)}`);
export const listarAccesos = (usuarioId: number) => pedir<Acceso[]>(`/usuarios/${usuarioId}/accesos`);
export const crearAcceso = (datos: { usuarioId: number; clienteId: number; sitioId?: number; panelId?: number }) =>
  pedir<Acceso>('/accesos', { method: 'POST', body: JSON.stringify(datos) });
export const eliminarAcceso = (id: number) => eliminar(`/accesos/${id}`);

export const listarUsuariosPanel = (panelId: number) => pedir<UsuarioPanel[]>(`/paneles/${panelId}/usuarios-panel`);
export const crearUsuarioPanel = (datos: { panelId: number; numero: string; nombre: string; telefono?: string }) =>
  pedir<UsuarioPanel>('/usuarios-panel', { method: 'POST', body: JSON.stringify(datos) });
export const eliminarUsuarioPanel = (id: number) => eliminar(`/usuarios-panel/${id}`);
export const crearUsuario = (datos: {
  email: string;
  nombre: string;
  clave: string;
  rol: 'admin' | 'operador' | 'cliente';
  clienteId?: number;
}) => pedir<UsuarioAdmin>('/usuarios', { method: 'POST', body: JSON.stringify(datos) });
export const editarUsuario = (id: number, datos: { nombre?: string; rol?: 'admin' | 'operador'; activo?: boolean; clave?: string }) =>
  editar<UsuarioAdmin>(`/usuarios/${id}`, datos);
export const verTablero = () => pedir<Tablero>('/tablero');

export const generarReporte = (clienteId: number, desde: string, hasta: string) =>
  pedir<Reporte>(`/reportes?clienteId=${clienteId}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);

export const avisarHombreMuerto = () =>
  pedir<{ alarmaId: number }>('/vigilancia/hombre-muerto', { method: 'POST' });

export const verConfiguracion = () => pedir<{ hombreMuerto: ConfigHombreMuerto }>('/configuracion');
export const guardarHombreMuerto = (datos: ConfigHombreMuerto) =>
  pedir<{ hombreMuerto: ConfigHombreMuerto }>('/configuracion/hombre-muerto', {
    method: 'PUT',
    body: JSON.stringify(datos),
  });

export const cambiarClave = (actual: string, nueva: string) =>
  pedir<{ ok: boolean }>('/auth/clave', { method: 'POST', body: JSON.stringify({ actual, nueva }) });

// ---- Vista de clientes (rol 'cliente') ----
export const verResumenCliente = () => pedir<ResumenCliente>('/cliente/resumen');
export const verEventosCliente = () => pedir<EventoCliente[]>('/cliente/eventos?limite=100');
export const verAlarmasCliente = () => pedir<AlarmaCliente[]>('/cliente/alarmas');
export const enviarPanico = (sitioId: number) =>
  pedir<{ alarmaId: number; recibido: boolean }>('/cliente/panico', {
    method: 'POST',
    body: JSON.stringify({ sitioId }),
  });
