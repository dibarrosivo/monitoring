import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PantallaCliente } from '../src/cliente/PantallaCliente.js';
import '../src/index.css';

const hoy = new Date();
const h = (dias: number, hora: string) => {
  const d = new Date(hoy.getTime() - dias * 86_400_000);
  const [hh, mm] = hora.split(':').map(Number);
  d.setHours(hh!, mm!, 0, 0);
  return d.toISOString();
};
// ?tipo=hikvision: el primer panel pasa a Hikvision, con estado detallado y control desde la app
const tipoPanel = new URLSearchParams(location.search).get('tipo') === 'hikvision' ? 'hikvision' : 'pima';
const panel = {
  id: 50, numeroCuenta: '5154', prefijo: 'AL', tipo: tipoPanel, activo: true, ultimaSenalEn: h(0, '09:44'),
  sitioId: 50, sitioNombre: 'Café del Faro', sitioDireccion: 'Av. Los Médanos, Coro', clienteId: 50, clienteNombre: 'CAFE DEL FARO',
  estadoArmado: 'desarmado' as const, ultimoMovimientoEn: h(0, '11:22'),
};
const respuestas: Record<string, unknown> = {
  'estado-detallado': {
    particiones: [{ particion: 1, nombre: 'Local', habilitada: true, estado: 'armado', enAlarma: false }],
    zonas: [
      { numero: 1, nombre: 'Cocina - Atención al cliente', estado: 'normal', armada: true, enAlarma: false, tipo: 'infrarrojo', descripcion: null },
      { numero: 2, nombre: 'Oficina principal - Pasillo', estado: 'normal', armada: true, enAlarma: false, tipo: 'infrarrojo', descripcion: null },
      { numero: 3, nombre: 'Gerencia', estado: 'normal', armada: true, enAlarma: false, tipo: 'infrarrojo', descripcion: null },
      { numero: 5, nombre: 'Puerta trasera', estado: 'normal', armada: true, enAlarma: false, tipo: 'magnetico', descripcion: null },
      { numero: 7, nombre: 'Puerta trasera exterior', estado: 'anulada', armada: false, enAlarma: false, tipo: 'pulsador', descripcion: null },
    ],
    bateria: { porcentaje: 96, estado: 'normal' },
    comunicaciones: { cable: 'conectado', wifi: 'conectado', senalWifi: 82, nube: 'en línea' },
    perifericos: [{ tipo: 'sirena', nombre: 'Sirena exterior', estado: 'normal', sabotaje: false }, { tipo: 'teclado', nombre: 'Teclado entrada', estado: 'normal', sabotaje: false }],
  },
  '/comandos': [
    { id: 3, accion: 'armar', particion: '1', estado: 'ejecutado', detalle: null, creadoEn: h(0, '19:02'), resueltoEn: h(0, '19:02'), usuarioId: 9, usuarioNombre: 'Andrés Molina', origen: 'cliente' },
    { id: 2, accion: 'desarmar', particion: '1', estado: 'ejecutado', detalle: null, creadoEn: h(0, '07:58'), resueltoEn: h(0, '07:58'), usuarioId: 9, usuarioNombre: 'Andrés Molina', origen: 'cliente' },
    { id: 1, accion: 'armar', particion: '1', estado: 'ejecutado', detalle: null, creadoEn: h(1, '19:10'), resueltoEn: h(1, '19:10'), usuarioId: 2, usuarioNombre: 'Daniel', origen: 'operador' },
  ],
  'cliente/resumen': {
    paneles: [
      panel,
      { ...panel, id: 24, numeroCuenta: '5126', sitioId: 24, sitioNombre: 'Cerco Café del Faro', sitioDireccion: 'Av. Los Médanos, Coro', estadoArmado: 'armado' as const, ultimoMovimientoEn: h(0, '04:02'), ultimaSenalEn: h(0, '10:12') },
    ],
    propietarioDe: [50],
  },
  'cliente/usuarios': [
    { id: 9, nombre: 'Andrés Molina', email: 'andres@example.com', activo: true, clienteId: 50, clienteNombre: 'CAFE DEL FARO', propietario: true, sitioId: null, sitioNombre: null, panelId: null },
    { id: 12, nombre: 'Marta Lugo', email: 'marta@example.com', activo: true, clienteId: 50, clienteNombre: 'CAFE DEL FARO', propietario: false, sitioId: null, sitioNombre: null, panelId: null },
    { id: 14, nombre: 'Pedro Salas', email: 'pedro@example.com', activo: false, clienteId: 50, clienteNombre: 'CAFE DEL FARO', propietario: false, sitioId: null, sitioNombre: null, panelId: null },
  ],
  'cliente/contactos': [
    { id: 1, clienteId: 50, sitioId: 50, nombre: 'Julio Navas', rol: 'Encargado', telefono: '0412-5550102', telefonoAlternativo: null, orden: 1, autorizadoCancelar: false },
    { id: 2, clienteId: 50, sitioId: 50, nombre: 'Pedro Salas', rol: 'Propietario', telefono: '0412-5550103', telefonoAlternativo: null, orden: 2, autorizadoCancelar: true },
    { id: 3, clienteId: 50, sitioId: 50, nombre: 'Marta Lugo', rol: 'Empleado', telefono: '0412-5550104', telefonoAlternativo: null, orden: 3, autorizadoCancelar: false },
  ],
  'cliente/alarmas': [],
  'cliente/cobros': {
    tasa: { valor: 855.6625, fechaValor: '2026-09-25', fuente: 'bcv', obtenidoEn: '2026-09-24T20:00:00Z' },
    clientes: [
      {
        clienteId: 50,
        nombre: 'Café del Faro',
        exonerado: false,
        dispositivos: [
          { panelId: 23, numeroCuenta: '5154', prefijo: 'AL', sitioNombre: 'Café del Faro', exonerado: false, plan: 'Comercial', precioUsd: 25, meses: 1, proximoVencimiento: '2026-10-01' },
          { panelId: 24, numeroCuenta: '5126', prefijo: 'AL', sitioNombre: 'Cerco Café del Faro', exonerado: false, plan: 'Comercial', precioUsd: 20, meses: 1, proximoVencimiento: '2026-10-01' },
        ],
        cuotasPendientes: [
          { id: 9, concepto: 'Mensualidad de septiembre 2026', numeroCuenta: '5154', prefijo: 'AL', venceEn: '2026-09-06', montoUsd: 25, pagadoUsd: 0, vencida: true },
          { id: 10, concepto: 'Mensualidad de septiembre 2026', numeroCuenta: '5126', prefijo: 'AL', venceEn: '2026-09-06', montoUsd: 20, pagadoUsd: 0, vencida: true },
        ],
        ultimosPagos: [
          { id: 2, fecha: '2026-08-03', montoUsd: 45, montoBs: 37200.5, forma: 'pago_movil', referencia: '4471', estado: 'confirmado' },
          { id: 1, fecha: '2026-07-02', montoUsd: 45, montoBs: null, forma: 'zelle', referencia: null, estado: 'confirmado' },
        ],
        pendienteUsd: 45,
        vencidoUsd: 45,
        saldoAFavorUsd: 0,
        pendienteBs: 38504.81,
      },
    ],
  },
  'cliente/preferencias': { armadoDesarmado: true, averias: true, sistema: true, silencioDesde: '22:00', silencioHasta: '07:00' },
  'paneles/50/zonas': [
    { numero: '001', descripcion: 'Cocina - Atención al cliente INFRA' }, { numero: '002', descripcion: 'Oficina principal - Pasillo INFRA' },
    { numero: '003', descripcion: 'Gerencia INFRA' }, { numero: '005', descripcion: 'Puerta trasera MAG' },
    { numero: '007', descripcion: 'Puerta trasera exterior PULSADOR' }, { numero: '008', descripcion: 'Caja PULSADOR' }, { numero: '014', descripcion: 'Entrada INFRA' },
  ],
  'cliente/eventos': [
    { id: 1, panelId: 50, categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario — Marta Lugo (cód. 6)', zona: '006', zonaDescripcion: null, ocurridoEn: h(0, '11:22') },
    { id: 2, panelId: 50, categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario — Augusto Hernández (cód. 1)', zona: '001', zonaDescripcion: null, ocurridoEn: h(0, '04:02') },
    { id: 3, panelId: 50, categoria: 'alarma', codigo: 'E130', descripcion: 'Robo: Robo perímetro', zona: '005', zonaDescripcion: 'Puerta trasera MAG', ocurridoEn: h(1, '23:41') },
    { id: 4, panelId: 50, categoria: 'restauracion', codigo: 'R130', descripcion: 'Restauración: Robo perímetro', zona: '005', zonaDescripcion: 'Puerta trasera MAG', ocurridoEn: h(1, '23:43') },
    { id: 5, panelId: 50, categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario — Augusto Hernández (cód. 1)', zona: '001', zonaDescripcion: null, ocurridoEn: h(1, '04:05') },
    { id: 6, panelId: 50, categoria: 'averia', codigo: 'E301', descripcion: 'Falla de electricidad (sin corriente)', zona: null, zonaDescripcion: null, ocurridoEn: h(2, '15:10') },
    { id: 7, panelId: 50, categoria: 'restauracion', codigo: 'R301', descripcion: 'Restauración de electricidad', zona: null, zonaDescripcion: null, ocurridoEn: h(2, '16:48') },
  ],
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
// Variantes de color para comparar: ?variante=verde | marca | claro | claroverde
const variante = new URLSearchParams(location.search).get('variante');
if (variante === 'claro' || variante === 'claroverde') { localStorage.setItem('monitoring.tema', 'claro'); document.documentElement.setAttribute('data-theme', 'light'); } else localStorage.removeItem('monitoring.tema');
const estilos: Record<string, string> = {
  verde: ':root{--color-acento:#3ddc97}',
  marca: ':root{--color-fondo:#0f2318;--color-superficie:#16311f;--color-superficie-2:#1d3d28;--color-borde:#2c5a3a;--color-texto:#e7f3ea;--color-tenue:#8fb39a;--color-acento:#5be0a0}',
  claroverde: ':root[data-theme="light"]{--color-acento:#1f7a4d;--color-fondo:#eef4ef;--color-superficie:#ffffff;--color-superficie-2:#f1f6f2;--color-borde:#cddbd1}',
};
const acento = new URLSearchParams(location.search).get('acento');
const tema = new URLSearchParams(location.search).get('tema');
if (tema === 'claro') { localStorage.setItem('monitoring.tema', 'claro'); document.documentElement.setAttribute('data-theme', 'light'); }
if (acento) { const st = document.createElement('style'); st.textContent = `:root, :root[data-theme="light"], :root[data-theme="dark"]{--color-acento:#${acento}}`; document.head.appendChild(st); }
if (variante && estilos[variante]) {
  const st = document.createElement('style');
  st.textContent = estilos[variante];
  document.head.appendChild(st);
}
localStorage.setItem('monitoring.avisos.vistoHasta', String(hoy.getTime() - 20 * 3_600_000));
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <PantallaCliente usuario={{ id: 9, email: 'andres@example.com', nombre: 'Andrés Molina', rol: 'cliente' }} />
  </QueryClientProvider>,
);
// #avisos abre la pestaña de avisos; #panel abre la pantalla del panel
setTimeout(() => {
  if (location.hash === '#avisos' || location.hash === '#prefs') [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Avisos'))?.click();
  if (location.hash === '#prefs') setTimeout(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Qué recibir'))?.click(), 300);
  if (location.hash === '#panel') (document.querySelector('section[role=button]') as HTMLElement | null)?.click();
  if (location.hash === '#eventos') [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Eventos'))?.click();
  if (location.hash === '#cuenta') [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Cuenta'))?.click();
}, 800);
