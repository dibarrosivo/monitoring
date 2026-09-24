import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Supervision } from '../src/vistas/Supervision.js';
import '../src/index.css';

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const respuestas: Record<string, unknown> = {
  '/actividad': {
    operador: { id: 2, nombre: 'Daniel', email: 'daniel@falconseguridadtotal.com' }, periodo: { desde: hace(10080), hasta: hace(0) },
    acciones: [
      { id: 9, creadoEn: hace(12), tipo: 'cierre', detalle: 'Falsa alarma tras 4 min 10 s en atención: Mascota u objeto en movimiento', alarmaId: 51, codigo: 'E140', descripcion: 'Alarma en zona 3', numeroCuenta: '5148', prefijo: 'AL', clienteNombre: 'COMERCIAL ANDINA' },
      { id: 8, creadoEn: hace(14), tipo: 'llamada', detalle: 'Llamada a Luis Pérez (0412-5550105): Atendió, palabra clave correcta', alarmaId: 51, codigo: 'E140', descripcion: 'Alarma en zona 3', numeroCuenta: '5148', prefijo: 'AL', clienteNombre: 'COMERCIAL ANDINA' },
      { id: 7, creadoEn: hace(16), tipo: 'toma', detalle: 'Tomada tras 45 s de espera', alarmaId: 51, codigo: 'E140', descripcion: 'Alarma en zona 3', numeroCuenta: '5148', prefijo: 'AL', clienteNombre: 'COMERCIAL ANDINA' },
    ],
    sesiones: [{ id: 3, ingresoEn: hace(180), ultimaActividadEn: hace(2), ip: '::ffff:38.51.121.28', agente: null }],
    hombreMuerto: [{ id: 30, ocurridoEn: hace(95), descripcion: 'HOMBRE MUERTO: daniel@falconseguridadtotal.com no confirmó presencia en la consola' }],
  },
  '/supervision': {
    periodo: { desde: hace(10080), hasta: hace(0) },
    operadores: [
      { id: 2, nombre: 'Daniel', email: 'daniel@falconseguridadtotal.com', rol: 'operador', activo: true, tomadas: 14, cerradas: 12, reaccionMediaSeg: 48, reaccionMaxSeg: 410, atencionMediaSeg: 262, desenlaces: { resuelta: 7, falsa_alarma: 4, escalada: 1 }, motivos: [], llamadas: 19, notas: 6, pasos: 21, devoluciones: 1, hombreMuerto: 1, sesiones: 5, horasEnServicio: 31.4, ultimaActividadEn: hace(2), enServicio: true },
      { id: 3, nombre: 'Samuel', email: 'samuel@falconseguridadtotal.com', rol: 'operador', activo: true, tomadas: 9, cerradas: 9, reaccionMediaSeg: 150, reaccionMaxSeg: 900, atencionMediaSeg: 180, desenlaces: { resuelta: 6, falsa_alarma: 3, escalada: 0 }, motivos: [], llamadas: 0, notas: 2, pasos: 4, devoluciones: 0, hombreMuerto: 0, sesiones: 4, horasEnServicio: 26.0, ultimaActividadEn: hace(220), enServicio: false },
      { id: 1, nombre: 'Administrador', email: 'admin@monitoring.local', rol: 'admin', activo: true, tomadas: 0, cerradas: 24, reaccionMediaSeg: null, reaccionMaxSeg: null, atencionMediaSeg: null, desenlaces: { resuelta: 24, falsa_alarma: 0, escalada: 0 }, motivos: [], llamadas: 0, notas: 0, pasos: 0, devoluciones: 0, hombreMuerto: 0, sesiones: 9, horasEnServicio: 40.2, ultimaActividadEn: hace(1), enServicio: true },
    ],
    alertas: [
      { tipo: 'sin_tomar', alarmaId: 60, prioridad: 1, texto: 'E120 Pánico (AL-5175) lleva 3 min sin tomar' },
      { tipo: 'cierre_sin_llamada', alarmaId: 58, texto: 'Samuel cerró E130 Robo sin registrar ninguna llamada' },
      { tipo: 'sin_actividad', usuarioId: 3, texto: 'Samuel no toca la consola hace 220 min' },
    ],
  },
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="p-4 bg-fondo min-h-screen"><Supervision /></div>
  </QueryClientProvider>,
);
setTimeout(() => (document.querySelector('tbody tr') as HTMLElement | null)?.click(), 900);
