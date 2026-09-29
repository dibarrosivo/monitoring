import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Consola } from '../src/Consola.js';
import '../src/index.css';

window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const cuerpo = url.includes('/tablero')
    ? { alarmas: { nuevas: 0, enAtencion: 0, cerradasHoy: 0 }, paneles: { activos: 4, silenciosos: 0 }, clientes: { activos: 3 }, hoy: { senales: 12, eventos: 8 }, facturacion: { vencidos: 0, porVencer: 0, cuentas: [] }, eventosHoyPorCategoria: [], ultimasAlarmas: [] }
    : [];
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Consola usuario={{ id: 5, email: 'ivo@falconseguridadtotal.com', nombre: 'Ivo Di Barros', rol: 'admin', tieneAcceso: true }} />
  </QueryClientProvider>,
);
// Abre el menú de hamburguesa para ver el botón de volver
setTimeout(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes('enú') || b.textContent === '☰')?.click(), 700);
