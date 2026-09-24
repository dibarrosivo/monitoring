import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Cola } from '../src/vistas/Cola.js';
import '../src/index.css';

const alarma = (id: number, codigo: string, descripcion: string, cuenta: string, cliente: string, zona: string | null, estado: 'nueva' | 'en_atencion', prioridad = 2, tipo = 'robo', clienteId = 3) => ({
  id, estado, prioridad, operadorId: estado === 'en_atencion' ? 2 : null, creadoEn: '2026-09-15T02:49:46Z', tomadaEn: estado === 'en_atencion' ? '2026-09-17T15:40:02Z' : null, cerradaEn: null,
  desenlace: null, motivo: null, resolucion: null, operadorNombre: estado === 'en_atencion' ? 'Daniel' : null, panelId: 3, zonaDescripcion: null, clienteId, clienteNombre: cliente, prefijo: 'AL',
  evento: { id, senalId: 10, codigo, categoria: 'alarma', descripcion, numeroCuenta: cuenta, particion: '01', zona, ocurridoEn: '2026-09-15T02:49:46Z', tipo },
});
const alarmas = [
  { ...alarma(1, 'E140', 'Alarma en zona 11', '5102', 'PANADERIA LA ESPIGA', '011', 'en_atencion'), restauradaEn: '2026-09-17T15:52:00Z' },
  { ...alarma(2, 'E140', 'Alarma general', '5148', 'COMERCIAL ANDINA', null, 'nueva', 2, 'robo', 8), panelId: 8 },
  { ...alarma(3, 'E140', 'Alarma en zona 17', '5148', 'COMERCIAL ANDINA', '017', 'nueva', 2, 'robo', 8), panelId: 8 },
  { ...alarma(5, 'E140', 'Alarma en zona 18', '5148', 'COMERCIAL ANDINA', '018', 'nueva', 2, 'robo', 8), panelId: 8 },
  { ...alarma(4, 'E120', 'Pánico', '5175', 'RESIDENCIA MOLINA', '004', 'nueva', 1, 'emergencia', 9), panelId: 9 },
  { ...alarma(6, 'E301', 'Falla de red eléctrica', '5131', 'FARMACIA VIDA', null, 'nueva', 3, 'averia', 10), panelId: 10, prefijo: 'HIK' },
  { ...alarma(7, 'E302', 'Batería baja', '5131', 'FARMACIA VIDA', null, 'nueva', 3, 'averia', 10), panelId: 10, prefijo: 'HIK' },
  { ...alarma(8, 'PIMA-TO', 'No ha cerrado a horario', '5112', 'LICORERIA EL MUELLE', null, 'nueva', 3, 'horario', 11), panelId: 11 },
  { ...alarma(9, 'E602', 'Prueba periódica', '5137', 'DEPOSITO NORTE', null, 'nueva', 5, 'prueba', 12), panelId: 12, prefijo: 'EBS' },
  { ...alarma(10, 'SIS', 'Panel silencioso: sin señales hace 26 h', '5190', 'BODEGON LOS MEDANOS', null, 'nueva', 2, 'sistema', 13), panelId: 13 },
  { ...alarma(11, 'E130', 'Robo: Robo perímetro', '5116', 'FERRETERIA EL TORNILLO', '001', 'nueva', 2, 'robo', 18), panelId: 18, creadoEn: new Date().toISOString(), enVerificacionHasta: new Date(Date.now() + 38_000).toISOString() },
];
const respuestas: Record<string, unknown> = {
  '/contexto': { cliente: { id: 1, nombre: 'PANADERIA LA ESPIGA', telefono: null, instrucciones: null, estado: 'activo', motivoEstado: null }, sitio: { id: 3, nombre: 'PANADERIA LA ESPIGA', tipo: 'comercial', direccion: null, ciudad: null, referencia: null, latitud: null, longitud: null, telefono: null, llaves: null, instruccionesAcceso: null, instrucciones: null }, panel: { id: 3, numeroCuenta: '5102', alias: null, tipo: 'otro', marca: null, modelo: null, claveMaestra: null }, contactos: [], zonaDescripcion: null, pasos: ['Llamar al sitio y pedir la palabra clave', 'Llamar a los contactos por orden de la lista', 'Despachar móvil si no se puede verificar'], pasosCumplidos: [], horarios: [{ id: 1, panelId: 3, dias: 'LMXJV--', apertura: '07:00', cierre: '19:00', toleranciaMin: 15, activo: true }], usuariosPanel: [{ id: 1, panelId: 3, numero: '001', nombre: 'Laura Ríos', telefono: '0412-5550101', contactoId: null }, { id: 2, panelId: 3, numero: '006', nombre: 'Carlos Peña', telefono: null, contactoId: null }], previas: [{ id: 40, codigo: 'E140', descripcion: 'Alarma en zona 11', creadoEn: '2026-09-15T21:22:00Z', cerradaEn: '2026-09-15T21:40:00Z', desenlace: 'falsa_alarma', resolucion: 'Mascota u objeto en movimiento', operadorNombre: 'Samuel' }] },
  '/acciones': [{ id: 1, alarmaId: 1, operadorId: 2, operadorNombre: 'Daniel', tipo: 'toma', detalle: 'Tomada tras 60 h 50 min de espera', creadoEn: '2026-09-17T15:40:02Z' }],
  '/alarmas': alarmas,
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
if (new URLSearchParams(location.search).get('tema') === 'claro') document.documentElement.dataset.theme = 'light';
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="h-screen p-4 flex flex-col bg-fondo">
      <Cola alarmaReciente={null} />
    </div>
  </QueryClientProvider>,
);
// Marca las dos fallas de Farmacia La Costa para ver la barra de lote
setTimeout(() => {
  const casillas = document.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]');
  casillas[3]?.click();
  casillas[6]?.click();
  // Con #cerrar en la URL se abre además el cierre en lote
  if (location.hash === '#cerrar') {
    setTimeout(() => {
      const boton = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Cerrar') && b.textContent.includes('…'));
      boton?.click();
    }, 300);
  }
}, 900);
