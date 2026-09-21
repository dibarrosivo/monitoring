import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Calendario } from '../src/vistas/Calendario.js';
import { feriadosVenezuela } from '../src/feriados.js';
import '../src/index.css';

const feriados = feriadosVenezuela(2026).map((f, i) => ({ id: i + 1, ...f }));
feriados.push({ id: 99, fecha: '2026-07-26', descripcion: 'Día de Coro' });
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  return new Response(JSON.stringify(url.includes('/feriados') ? feriados : []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="min-h-screen p-4 bg-fondo">
      <Calendario />
    </div>
  </QueryClientProvider>,
);
