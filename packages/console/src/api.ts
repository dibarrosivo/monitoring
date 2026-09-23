import type { ResultadoLlamada } from './cierres.js';
import type {
  Acceso,
  AccionAlarma,
  AccionComando,
  ActividadOperador,
  Alarma,
  AlarmaCliente,
  Cliente,
  ClienteDetalle,
  ClienteResumen,
  Comando,
  ConfigHombreMuerto,
  Contacto,
  ContactoApp,
  ContextoAlarma,
  DesenlaceAlarma,
  DiarioPuente,
  EntradaCatalogo,
  EstadoCliente,
  EstadoDetalladoPanel,
  EstadoPanel,
  EstadoParticion,
  Evento,
  EventoCliente,
  Feriado,
  Horario,
  PreferenciasAviso,
  Puente,
  RegistroAuditoria,
  Reporte,
  ResultadoBusqueda,
  ResumenCliente,
  Senal,
  Sitio,
  Supervision,
  Tablero,
  Usuario,
  UsuarioAdmin,
  UsuarioApp,
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

/** Servidor de la central al que apunta la app nativa si nadie configuró otro. */
export const SERVIDOR_POR_DEFECTO = 'https://monitoreo.falconseguridadtotal.com';

/** URL del servidor de la central. Vacío = mismo origen (web). */
export function servidorGuardado(): string {
  const guardado = localStorage.getItem(CLAVE_SERVIDOR) ?? '';
  // En la app instalada el servidor es el de la central, sin que el usuario lo escriba
  return guardado || (esNativo() ? SERVIDOR_POR_DEFECTO : '');
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
export const cerrarAlarma = (id: number, cierre: { desenlace: DesenlaceAlarma; motivo?: string; resolucion?: string }) =>
  pedir<Alarma>(`/alarmas/${id}/cerrar`, { method: 'POST', body: JSON.stringify(cierre) });
export const devolverAlarma = (id: number, motivo?: string) =>
  pedir<Alarma>(`/alarmas/${id}/devolver`, { method: 'POST', body: JSON.stringify({ motivo }) });
export const registrarLlamada = (
  id: number,
  llamada: { contactoId?: number; nombre: string; telefono: string; resultado: ResultadoLlamada },
) => pedir<AccionAlarma>(`/alarmas/${id}/llamada`, { method: 'POST', body: JSON.stringify(llamada) });
export const marcarPaso = (id: number, paso: string) =>
  pedir<{ ok: true }>(`/alarmas/${id}/paso`, { method: 'POST', body: JSON.stringify({ paso }) });

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
  prefijo?: string | null;
  tipo: 'hikvision' | 'pima' | 'ebs' | 'otro';
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

/** Alta en un paso: cliente + sitio + dispositivo (+ contacto opcional). */
export const crearAlta = (datos: {
  cliente: Record<string, unknown>;
  sitio: Record<string, unknown>;
  dispositivo: Record<string, unknown>;
  contacto?: Record<string, unknown>;
}) => pedir<{ cliente: Cliente; sitio: Sitio; dispositivo: EstadoPanel }>('/altas', {
  method: 'POST',
  body: JSON.stringify(datos),
});

export const cambiarEstadoCliente = (id: number, estado: EstadoCliente, motivoEstado?: string) =>
  pedir<Cliente>(`/clientes/${id}/estado`, { method: 'PUT', body: JSON.stringify({ estado, motivoEstado }) });

export const registrarPago = (panelId: number) =>
  pedir<EstadoPanel>(`/paneles/${panelId}/pago`, { method: 'POST' });

export const listarPuentes = () => pedir<Puente[]>('/bridges');
export const editarPuente = (id: number, datos: { descripcion?: string; supervisado?: boolean; intervaloLatidoSeg?: number; activo?: boolean }) =>
  editar<Puente>(`/bridges/${id}`, datos);
export const diarioPuente = (id: number, limite = 150) => pedir<DiarioPuente>(`/bridges/${id}/diario?limite=${limite}`);

export const listarCatalogo = (tipo: string) =>
  pedir<EntradaCatalogo[]>(`/catalogos?tipo=${encodeURIComponent(tipo)}`);

export const enviarComando = (panelId: number, accion: AccionComando) =>
  pedir<{ comandoId: number; aceptado: boolean; detalle?: string }>(`/paneles/${panelId}/comando`, {
    method: 'POST',
    body: JSON.stringify({ accion }),
  });
export const listarComandos = (panelId: number) => pedir<Comando[]>(`/paneles/${panelId}/comandos`);
export const estadoArmado = (panelId: number) =>
  pedir<{ particiones: EstadoParticion[] }>(`/paneles/${panelId}/estado-armado`);
export const estadoDetallado = (panelId: number) => pedir<EstadoDetalladoPanel>(`/paneles/${panelId}/estado-detallado`);

export const listarFeriados = () => pedir<Feriado[]>('/feriados');
export const crearFeriado = (datos: { fecha: string; descripcion?: string }) =>
  pedir<Feriado>('/feriados', { method: 'POST', body: JSON.stringify(datos) });
export const eliminarFeriado = (id: number) => eliminar(`/feriados/${id}`);

export const listarAuditoria = (entidad?: string, entidadId?: number) =>
  pedir<RegistroAuditoria[]>(
    entidad && entidadId ? `/auditoria?entidad=${entidad}&entidadId=${entidadId}` : '/auditoria',
  );
export const listarSenales = (limite = 200) => pedir<Senal[]>(`/senales?limite=${limite}`);

const editar = <T>(ruta: string, datos: unknown) =>
  pedir<T>(ruta, { method: 'PUT', body: JSON.stringify(datos) });
const eliminar = (ruta: string) => pedir<{ eliminado: boolean }>(ruta, { method: 'DELETE' });

export const editarCliente = (id: number, datos: Partial<Cliente>) => editar<Cliente>(`/clientes/${id}`, datos);
export const editarSitio = (id: number, datos: Partial<Omit<Sitio, 'id' | 'clienteId'>>) =>
  editar<Sitio>(`/sitios/${id}`, datos);
export const eliminarSitio = (id: number) => eliminar(`/sitios/${id}`);
export const editarPanel = (id: number, datos: Partial<Omit<EstadoPanel, 'id' | 'sitioId' | 'ultimaSenalEn'>> & { modelo?: string }) =>
  editar<EstadoPanel>(`/paneles/${id}`, datos);
export const ponerEnPrueba = (panelId: number, datos: { horas: number; motivo: string }) =>
  pedir<EstadoPanel>(`/paneles/${panelId}/prueba`, { method: 'POST', body: JSON.stringify(datos) });
export const quitarPrueba = (panelId: number) => pedir<EstadoPanel>(`/paneles/${panelId}/prueba`, { method: 'DELETE' });
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
  rol: 'admin' | 'supervisor' | 'operador' | 'cliente';
  clienteId?: number;
}) => pedir<UsuarioAdmin>('/usuarios', { method: 'POST', body: JSON.stringify(datos) });
export const editarUsuario = (id: number, datos: { nombre?: string; rol?: 'admin' | 'supervisor' | 'operador'; activo?: boolean; clave?: string }) =>
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
export const verUsuariosCliente = () => pedir<UsuarioApp[]>('/cliente/usuarios');
export const crearUsuarioCliente = (datos: { clienteId: number; nombre: string; email: string; clave: string; sitioId?: number }) =>
  pedir<{ id: number }>('/cliente/usuarios', { method: 'POST', body: JSON.stringify(datos) });
export const cambiarEstadoUsuarioCliente = (id: number, datos: { clienteId: number; activo: boolean }) =>
  editar<{ id: number; activo: boolean }>(`/cliente/usuarios/${id}`, datos);
export const verContactosCliente = () => pedir<ContactoApp[]>('/cliente/contactos');
export const crearContactoCliente = (datos: Omit<ContactoApp, 'id' | 'autorizadoCancelar' | 'orden'> & { orden?: number }) =>
  pedir<ContactoApp>('/cliente/contactos', { method: 'POST', body: JSON.stringify(datos) });
export const editarContactoCliente = (id: number, datos: Partial<Omit<ContactoApp, 'id' | 'clienteId'>>) =>
  editar<ContactoApp>(`/cliente/contactos/${id}`, datos);
export const eliminarContactoCliente = (id: number) => eliminar(`/cliente/contactos/${id}`);
export const asignarPropietario = (usuarioId: number, datos: { clienteId: number; propietario: boolean }) =>
  editar<{ propietario: boolean }>(`/usuarios/${usuarioId}/propietario`, datos);
export const verPreferenciasCliente = () => pedir<PreferenciasAviso>('/cliente/preferencias');
export const guardarPreferenciasCliente = (datos: PreferenciasAviso) => editar<PreferenciasAviso>('/cliente/preferencias', datos);
export const verZonasCliente = (panelId: number) => pedir<{ numero: string; descripcion: string | null }[]>(`/cliente/paneles/${panelId}/zonas`);
export const verEventosCliente = (panelId?: number) =>
  pedir<EventoCliente[]>(panelId ? `/cliente/eventos?limite=50&panelId=${panelId}` : '/cliente/eventos?limite=100');
export const verAlarmasCliente = () => pedir<AlarmaCliente[]>('/cliente/alarmas');
export const enviarPanico = (sitioId: number) =>
  pedir<{ alarmaId: number; recibido: boolean }>('/cliente/panico', {
    method: 'POST',
    body: JSON.stringify({ sitioId }),
  });

export const verSupervision = (desde: string, hasta: string) =>
  pedir<Supervision>(`/supervision?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);
export const verActividadOperador = (id: number, desde: string, hasta: string) =>
  pedir<ActividadOperador>(`/supervision/operadores/${id}/actividad?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);

export const tomarLote = (ids: number[]) =>
  pedir<{ tomadas: number; omitidas: number }>('/alarmas/lote/tomar', { method: 'POST', body: JSON.stringify({ ids }) });
export const cerrarLote = (ids: number[], cierre: { desenlace: DesenlaceAlarma; motivo?: string; resolucion?: string }) =>
  pedir<{ cerradas: number; omitidas: number }>('/alarmas/lote/cerrar', { method: 'POST', body: JSON.stringify({ ids, ...cierre }) });
export const reabrirAlarma = (id: number) => pedir<Alarma>(`/alarmas/${id}/reabrir`, { method: 'POST' });
