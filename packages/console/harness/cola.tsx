import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Cola } from '../src/vistas/Cola.js';
import '../src/index.css';

const alarma = (id: number, codigo: string, descripcion: string, cuenta: string, cliente: string, zona: string | null, estado: 'nueva' | 'en_atencion', prioridad = 2) => ({
  id, estado, prioridad, operadorId: estado === 'en_atencion' ? 2 : null, creadoEn: '2026-09-15T02:49:46Z', tomadaEn: estado === 'en_atencion' ? '2026-09-17T15:40:02Z' : null, cerradaEn: null,
  desenlace: null, motivo: null, resolucion: null, operadorNombre: estado === 'en_atencion' ? 'Héctor' : null, panelId: 3, zonaDescripcion: null, clienteNombre: cliente,
  evento: { id, senalId: 10, codigo, categoria: 'alarma', descripcion, numeroCuenta: cuenta, particion: '01', zona, ocurridoEn: '2026-09-15T02:49:46Z' },
});
const alarmas = [
  alarma(1, 'E140', 'Alarma en zona 11', '7002', 'PANADERIA K3', '011', 'en_atencion'),
  alarma(2, 'E140', 'Alarma general', '7048', 'COMERCIAL GALIVEN', null, 'nueva'),
  alarma(3, 'E140', 'Alarma en zona 17', '7048', 'COMERCIAL GALIVEN', '017', 'nueva'),
  alarma(4, 'E130', 'Robo', '7075', 'ROMULO REYES', '004', 'nueva', 1),
];
const respuestas: Record<string, unknown> = {
  '/contexto': { cliente: { id: 1, nombre: 'PANADERIA K3', telefono: null, instrucciones: null, estado: 'activo', motivoEstado: null }, sitio: { id: 3, nombre: 'PANADERIA K3', tipo: 'comercial', direccion: null, ciudad: null, referencia: null, latitud: null, longitud: null, telefono: null, llaves: null, instruccionesAcceso: null, instrucciones: null }, panel: { id: 3, numeroCuenta: '7002', alias: null, tipo: 'otro', marca: null, modelo: null, claveMaestra: null }, contactos: [], zonaDescripcion: null, pasos: ['Llamar al sitio y pedir la palabra clave', 'Llamar a los contactos por orden de la lista', 'Despachar móvil si no se puede verificar'], pasosCumplidos: [] },
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
// Abre el detalle de la primera alarma una vez pintada la grilla
setTimeout(() => (document.querySelector('tbody tr') as HTMLElement | null)?.click(), 900);
