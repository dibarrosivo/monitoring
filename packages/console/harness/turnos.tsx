import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Turnos } from '../src/vistas/Turnos.js';
import '../src/index.css';

const hoy = new Date().toISOString().slice(0, 10);
const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const respuestas: Record<string, unknown> = {
  '/turnos': {
    pautas: [
      { id: 1, nombre: 'Semana A', activa: true },
      { id: 2, nombre: 'Semana B', activa: false },
    ],
    tramos: [
      { id: 1, pautaId: 1, usuarioId: 2, usuarioNombre: 'Daniel Rivas', dias: 'LMXJV--', desde: '07:00:00', hasta: '19:00:00', activo: true },
      { id: 2, pautaId: 1, usuarioId: 3, usuarioNombre: 'Samuel Ortega', dias: 'LMXJV--', desde: '19:00:00', hasta: '07:00:00', activo: true },
      { id: 3, pautaId: 1, usuarioId: 4, usuarioNombre: 'Valeria Peña', dias: '-----SD', desde: '00:00:00', hasta: '23:59:00', activo: true },
      { id: 4, pautaId: 2, usuarioId: 3, usuarioNombre: 'Samuel Ortega', dias: 'LMXJV--', desde: '07:00:00', hasta: '19:00:00', activo: true },
    ],
    guardias: [{ id: 1, usuarioId: 4, usuarioNombre: 'Valeria Peña', fecha: manana, desde: '07:00:00', hasta: '19:00:00', nota: 'cambio con Daniel' }],
    vigente: 1,
    deGuardiaAhora: [2],
  },
  '/usuarios': [
    { id: 1, email: 'admin@central', nombre: 'Administrador', rol: 'admin', activo: true, creadoEn: hoy },
    { id: 2, email: 'daniel@central', nombre: 'Daniel Rivas', rol: 'operador', activo: true, creadoEn: hoy },
    { id: 3, email: 'samuel@central', nombre: 'Samuel Ortega', rol: 'operador', activo: true, creadoEn: hoy },
    { id: 4, email: 'valeria@central', nombre: 'Valeria Peña', rol: 'supervisor', activo: true, creadoEn: hoy },
  ],
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).sort((a, b) => b.length - a.length).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
if (new URLSearchParams(location.search).get('tema') === 'claro') document.documentElement.dataset.theme = 'light';
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="min-h-screen p-4 bg-fondo">
      <Turnos />
    </div>
  </QueryClientProvider>,
);
