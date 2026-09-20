import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Cola } from '../src/vistas/Cola.js';
import '../src/index.css';

const alarma = (id: number, codigo: string, descripcion: string, cuenta: string, cliente: string, zona: string | null, estado: 'nueva' | 'en_atencion', prioridad = 2, tipo = 'robo', clienteId = 3) => ({
  id, estado, prioridad, operadorId: estado === 'en_atencion' ? 2 : null, creadoEn: '2026-09-15T02:49:46Z', tomadaEn: estado === 'en_atencion' ? '2026-09-17T15:40:02Z' : null, cerradaEn: null,
  desenlace: null, motivo: null, resolucion: null, operadorNombre: estado === 'en_atencion' ? 'Héctor' : null, panelId: 3, zonaDescripcion: null, clienteId, clienteNombre: cliente, prefijo: 'AL',
  evento: { id, senalId: 10, codigo, categoria: 'alarma', descripcion, numeroCuenta: cuenta, particion: '01', zona, ocurridoEn: '2026-09-15T02:49:46Z', tipo },
});
const alarmas = [
  { ...alarma(1, 'E140', 'Alarma en zona 11', '7002', 'PANADERIA K3', '011', 'en_atencion'), restauradaEn: '2026-09-17T15:52:00Z' },
  { ...alarma(2, 'E140', 'Alarma general', '7048', 'COMERCIAL GALIVEN', null, 'nueva', 2, 'robo', 8), panelId: 8 },
  { ...alarma(3, 'E140', 'Alarma en zona 17', '7048', 'COMERCIAL GALIVEN', '017', 'nueva', 2, 'robo', 8), panelId: 8 },
  { ...alarma(5, 'E140', 'Alarma en zona 18', '7048', 'COMERCIAL GALIVEN', '018', 'nueva', 2, 'robo', 8), panelId: 8 },
  { ...alarma(4, 'E120', 'Pánico', '7075', 'ROMULO REYES', '004', 'nueva', 1, 'emergencia', 9), panelId: 9 },
  { ...alarma(6, 'E301', 'Falla de red eléctrica', '7031', 'FARMACIA LA COSTA', null, 'nueva', 3, 'averia', 10), panelId: 10, prefijo: 'HIK' },
  { ...alarma(7, 'E302', 'Batería baja', '7031', 'FARMACIA LA COSTA', null, 'nueva', 3, 'averia', 10), panelId: 10, prefijo: 'HIK' },
  { ...alarma(8, 'PIMA-TO', 'No ha cerrado a horario', '7112', 'LICORERIA EL SOL', null, 'nueva', 3, 'horario', 11), panelId: 11 },
  { ...alarma(9, 'E602', 'Prueba periódica', '7037', 'MATARILE', null, 'nueva', 5, 'prueba', 12), panelId: 12, prefijo: 'EBS' },
  { ...alarma(10, 'SIS', 'Panel silencioso: sin señales hace 26 h', '7090', 'BODEGON CENTRAL', null, 'nueva', 2, 'sistema', 13), panelId: 13 },
];
const respuestas: Record<string, unknown> = {
  '/contexto': { cliente: { id: 1, nombre: 'PANADERIA K3', telefono: null, instrucciones: null, estado: 'activo', motivoEstado: null }, sitio: { id: 3, nombre: 'PANADERIA K3', tipo: 'comercial', direccion: null, ciudad: null, referencia: null, latitud: null, longitud: null, telefono: null, llaves: null, instruccionesAcceso: null, instrucciones: null }, panel: { id: 3, numeroCuenta: '7002', alias: null, tipo: 'otro', marca: null, modelo: null, claveMaestra: null }, contactos: [], zonaDescripcion: null, pasos: ['Llamar al sitio y pedir la palabra clave', 'Llamar a los contactos por orden de la lista', 'Despachar móvil si no se puede verificar'], pasosCumplidos: [], horarios: [{ id: 1, panelId: 3, dias: 'LMXJV--', apertura: '07:00', cierre: '19:00', toleranciaMin: 15, activo: true }], usuariosPanel: [{ id: 1, panelId: 3, numero: '001', nombre: 'Ana Pérez', telefono: '0414-1111111', contactoId: null }, { id: 2, panelId: 3, numero: '006', nombre: 'Luis Gómez', telefono: null, contactoId: null }], previas: [{ id: 40, codigo: 'E140', descripcion: 'Alarma en zona 11', creadoEn: '2026-09-15T21:22:00Z', cerradaEn: '2026-09-15T21:40:00Z', desenlace: 'falsa_alarma', resolucion: 'Mascota u objeto en movimiento', operadorNombre: 'Brayan' }] },
  '/acciones': [{ id: 1, alarmaId: 1, operadorId: 2, operadorNombre: 'Héctor', tipo: 'toma', detalle: 'Tomada tras 60 h 50 min de espera', creadoEn: '2026-09-17T15:40:02Z' }],
  '/alarmas': alarmas,
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
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
  casillas[5]?.click();
  // Con #cerrar en la URL se abre además el cierre en lote
  if (location.hash === '#cerrar') {
    setTimeout(() => {
      const boton = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Cerrar') && b.textContent.includes('…'));
      boton?.click();
    }, 300);
  }
}, 900);
