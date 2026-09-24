import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PantallaCliente } from '../src/cliente/PantallaCliente.js';
import '../src/index.css';

const respuestas: Record<string, unknown> = {
  'cliente/resumen': {
    paneles: [
      { id: 2, numeroCuenta: '5137', tipo: 'hikvision', activo: true, ultimaSenalEn: '2026-09-16T19:05:00Z', sitioId: 2, sitioNombre: 'Oficina Falcon', sitioDireccion: 'Av. Manaure, Coro', clienteId: 1, clienteNombre: 'Falcon Seguridad Total', estadoArmado: 'armado', ultimoMovimientoEn: '2026-09-16T19:02:00Z' },
      { id: 3, numeroCuenta: '5102', tipo: 'pima', activo: true, ultimaSenalEn: '2026-09-16T18:54:00Z', sitioId: 3, sitioNombre: 'Panadería La Espiga', sitioDireccion: 'Calle Zamora, Coro', clienteId: 1, clienteNombre: 'Falcon Seguridad Total', estadoArmado: 'desarmado', ultimoMovimientoEn: '2026-09-16T10:44:00Z' },
    ],
  },
  'cliente/alarmas': [],
  'cliente/eventos': [
    { id: 1, panelId: 2, categoria: 'cierre', codigo: 'R441', descripcion: 'Cierre (armado): Armado en modo presente — Ana (cód. 1)', zona: '001', zonaDescripcion: null, ocurridoEn: '2026-09-16T19:02:00Z' },
    { id: 5, panelId: 3, categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario', zona: '001', zonaDescripcion: null, ocurridoEn: '2026-09-16T10:44:00Z' },
    { id: 6, panelId: 3, categoria: 'averia', codigo: 'E302', descripcion: 'Batería baja', zona: null, zonaDescripcion: null, ocurridoEn: '2026-09-15T21:12:00Z' },
    { id: 7, panelId: 3, categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario', zona: '006', zonaDescripcion: null, ocurridoEn: '2026-09-15T18:51:00Z' },
  ],
  'version.json': null,
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
if (new URLSearchParams(location.search).get('tema') === 'claro') localStorage.setItem('monitoring.tema', 'claro'); else localStorage.removeItem('monitoring.tema');
localStorage.setItem('monitoring.token', 'x');
const pestana = new URLSearchParams(location.search).get('p');
if (pestana) localStorage.setItem('harness.pestana', pestana);
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <PantallaCliente usuario={{ id: 5, email: 'ana@cliente.com', nombre: 'Laura Ríos', rol: 'cliente' }} />
  </QueryClientProvider>,
);
// ?p=eventos: abre la pestaña de eventos una vez montada la pantalla
if (pestana === 'eventos') {
  setTimeout(() => {
    for (const b of Array.from(document.querySelectorAll('button'))) {
      if (b.textContent?.trim() === 'Eventos') b.click();
    }
  }, 800);
}
// ?tema=claro fuerza el tema claro para la captura
