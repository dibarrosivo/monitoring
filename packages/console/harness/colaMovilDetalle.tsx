import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ColaMovil } from '../src/vistas/ColaMovil.js';
import '../src/index.css';

/* Datos inventados: nunca clientes reales en un harness. */
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
let id = 900;
const ev = (min: number, categoria: string, codigo: string, descripcion: string, zona: string | null, extra: Record<string, unknown> = {}) => ({
  id: id--, senalId: id, panelId: 13, numeroCuenta: '5190', prefijo: 'AL', categoria, codigo, descripcion, particion: '01', zona, prioridad: 4, ocurridoEn: hace(min), zonaDescripcion: null, usuarioPanelNombre: null, ...extra,
});
const alarma = {
  id: 77, estado: 'nueva', prioridad: 2, creadoEn: hace(239), panelId: 13, clienteNombre: 'FARMACIA VIDA', prefijo: 'AL', zonaDescripcion: null, usuarioPanelNombre: null,
  evento: { id: 5000, senalId: 1, codigo: 'HOR-SC', categoria: 'sistema', descripcion: 'Sin cierre: cuenta 5190 sigue abierta pasado el horario', numeroCuenta: '5190', particion: '01', zona: null, ocurridoEn: hace(239) },
};
const contexto = {
  cliente: { id: 4, nombre: 'FARMACIA VIDA', telefono: null, instrucciones: null, estado: 'activo' },
  sitio: { id: 4, nombre: 'Sucursal centro', direccion: 'Av. Los Médanos, Coro', instrucciones: null },
  panel: { id: 13, numeroCuenta: '5190', prefijo: 'AL', tipo: 'pima' },
  contactos: [
    { id: 1, nombre: 'Pedro Salas', rol: 'Empleado', telefono: '0412-5550103', telefonoAlternativo: null, orden: 1, autorizadoCancelar: false },
    { id: 2, nombre: 'Marta Lugo', rol: 'Propietaria', telefono: '0412-5550104', telefonoAlternativo: null, orden: 2, autorizadoCancelar: true },
  ],
  zonaDescripcion: null, pasos: [], pasosCumplidos: [], usuariosPanel: [],
  horarios: [{ id: 1, panelId: 13, dias: 'LMXJVS-', apertura: '08:00', cierre: '18:00', toleranciaMin: 30, activo: true }],
  previas: [
    { id: 70, codigo: 'HOR-SC', descripcion: 'Sin cierre: cuenta 5190 sigue abierta pasado el horario', creadoEn: hace(60 * 24 * 3), cerradaEn: hace(60 * 24 * 3 - 20), desenlace: 'resuelta', resolucion: 'Verificado con el cliente, todo en orden', operadorNombre: 'Daniel' },
    { id: 62, codigo: 'E130', descripcion: 'Robo', creadoEn: hace(60 * 24 * 9), cerradaEn: hace(60 * 24 * 9 - 15), desenlace: 'falsa_alarma', resolucion: 'El cliente desarmó o restauró', operadorNombre: 'Valeria' },
  ],
};
const eventos = [
  ev(239, 'sistema', 'HOR-SC', 'Sin cierre: cuenta 5190 sigue abierta pasado el horario', null),
  ev(300, 'prueba', 'E602', 'Prueba periódica', null),
  ev(410, 'restauracion', 'R301', 'Restauración de electricidad', null),
  ev(455, 'averia', 'E301', 'Falla de electricidad (sin corriente)', null),
  ev(540, 'apertura', 'E401', 'Apertura (desarmado): Apertura/Cierre por usuario — Pedro Salas (cód. 3)', '003', { usuarioPanelNombre: 'Pedro Salas' }),
  ev(60 * 24 - 600, 'cierre', 'R401', 'Cierre (armado): Apertura/Cierre por usuario', '000'),
  ev(60 * 24 - 60, 'apertura', 'E401', 'Apertura (desarmado): Apertura/Cierre por usuario', '007'),
];
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const cuerpo = url.includes('/contexto') ? contexto : url.includes('/acciones') ? [] : url.includes('/eventos') ? eventos : url.includes('/alarmas') ? [alarma] : [];
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="bg-fondo text-texto min-h-screen p-3"><ColaMovil /></div>
  </QueryClientProvider>,
);
setTimeout(() => (document.querySelector('li button') as HTMLButtonElement | null)?.click(), 600);
