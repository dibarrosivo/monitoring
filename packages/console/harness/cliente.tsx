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
const panel = {
  id: 50, numeroCuenta: '7054', prefijo: 'AL', tipo: 'pima', activo: true, ultimaSenalEn: h(0, '09:44'),
  sitioId: 50, sitioNombre: 'Geralds Café', sitioDireccion: 'Variante Norte, Coro', clienteId: 50, clienteNombre: 'GERALDS CAFE',
  estadoArmado: 'desarmado' as const, ultimoMovimientoEn: h(0, '11:22'),
};
const respuestas: Record<string, unknown> = {
  'cliente/resumen': { paneles: [panel] },
  'cliente/alarmas': [],
  'paneles/50/zonas': [
    { numero: '001', descripcion: 'Cocina - Atención al cliente INFRA' }, { numero: '002', descripcion: 'Oficina principal - Pasillo INFRA' },
    { numero: '003', descripcion: 'Gerencia Oficina Gerardo INFRA' }, { numero: '005', descripcion: 'Puerta trasera MAG' },
    { numero: '007', descripcion: 'Puerta trasera exterior PULSADOR' }, { numero: '008', descripcion: 'Caja PULSADOR' }, { numero: '014', descripcion: 'Entrada INFRA' },
  ],
  'cliente/eventos': [
    { id: 1, panelId: 50, categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario — Crisbelys Herrera (cód. 6)', zona: '006', zonaDescripcion: null, ocurridoEn: h(0, '11:22') },
    { id: 2, panelId: 50, categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario — Augusto Hernández (cód. 1)', zona: '001', zonaDescripcion: null, ocurridoEn: h(0, '04:02') },
    { id: 3, panelId: 50, categoria: 'alarma', codigo: 'E130', descripcion: 'Robo: Robo perímetro', zona: '005', zonaDescripcion: 'Puerta trasera MAG', ocurridoEn: h(1, '23:41') },
    { id: 4, panelId: 50, categoria: 'restauracion', codigo: 'R130', descripcion: 'Restauración: Robo perímetro', zona: '005', zonaDescripcion: 'Puerta trasera MAG', ocurridoEn: h(1, '23:43') },
    { id: 5, panelId: 50, categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario — Augusto Hernández (cód. 1)', zona: '001', zonaDescripcion: null, ocurridoEn: h(1, '04:05') },
    { id: 6, panelId: 50, categoria: 'averia', codigo: 'E301', descripcion: 'Falla de red eléctrica', zona: null, zonaDescripcion: null, ocurridoEn: h(2, '15:10') },
    { id: 7, panelId: 50, categoria: 'restauracion', codigo: 'R301', descripcion: 'Restauración: Falla de red eléctrica', zona: null, zonaDescripcion: null, ocurridoEn: h(2, '16:48') },
  ],
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
localStorage.setItem('monitoring.avisos.vistoHasta', String(hoy.getTime() - 20 * 3_600_000));
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <PantallaCliente usuario={{ id: 9, email: 'gerald@example.com', nombre: 'Gerardo García', rol: 'cliente' }} />
  </QueryClientProvider>,
);
// #avisos abre la pestaña de avisos; #panel abre la pantalla del panel
setTimeout(() => {
  if (location.hash === '#avisos') [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Avisos'))?.click();
  if (location.hash === '#panel') (document.querySelector('section[role=button]') as HTMLElement | null)?.click();
}, 800);
