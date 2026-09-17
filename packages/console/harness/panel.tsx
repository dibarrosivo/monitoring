import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PanelHikvision } from '../src/cliente/PanelHikvision.js';
import '../src/index.css';

// Muestra con datos fijos: la forma exacta que devuelve el servidor para el panel 7037
const respuestas: Record<string, unknown> = {
  'estado-detallado': {
    particiones: [{ particion: 1, nombre: 'Bella Nova', habilitada: true, estado: 'armado_casa', enAlarma: false }],
    zonas: [
      { numero: 1, nombre: 'Z1-Puerta E/S', estado: 'normal', armada: true, enAlarma: false, tipo: 'Delay', descripcion: null },
      { numero: 2, nombre: 'Z2-Sala', estado: 'anulada', armada: false, enAlarma: false, tipo: 'Follow', descripcion: 'Sensor de movimiento de la sala' },
      { numero: 3, nombre: 'Z3-Puerta depósito', estado: 'normal', armada: true, enAlarma: false, tipo: 'Instant', descripcion: null },
      { numero: 4, nombre: 'Z4-Oficina', estado: 'sin_conexion', armada: true, enAlarma: false, tipo: 'Instant', descripcion: null },
    ],
    bateria: { porcentaje: 100, estado: 'normal' },
    comunicaciones: { cable: 'break', wifi: 'normal', senalWifi: 4, nube: 'normal' },
    perifericos: [{ tipo: 'teclado', nombre: 'Keypad 1', estado: 'online', sabotaje: false }],
  },
  'cliente/eventos': [
    { id: 1, panelId: 2, categoria: 'cierre', codigo: 'R441', descripcion: 'Cierre (armado): Armado en modo presente — Ana (cód. 1)', zona: '001', zonaDescripcion: null, ocurridoEn: '2026-09-16T19:02:00Z' },
    { id: 2, panelId: 2, categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario — Ana (cód. 1)', zona: '001', zonaDescripcion: null, ocurridoEn: '2026-09-16T11:04:00Z' },
    { id: 3, panelId: 2, categoria: 'alarma', codigo: 'E130', descripcion: 'Robo', zona: '003', zonaDescripcion: 'Puerta depósito', ocurridoEn: '2026-09-15T02:41:00Z' },
    { id: 4, panelId: 2, categoria: 'restauracion', codigo: 'R301', descripcion: 'Restauración: Falla de red eléctrica', zona: null, zonaDescripcion: null, ocurridoEn: '2026-09-14T22:10:00Z' },
  ],
  comandos: [
    { id: 9, accion: 'armar_casa', particion: '01', estado: 'confirmado', detalle: null, creadoEn: '2026-09-16T19:01:40Z', resueltoEn: '2026-09-16T19:02:01Z', usuarioId: 5 },
    { id: 8, accion: 'desarmar', particion: '01', estado: 'confirmado', detalle: null, creadoEn: '2026-09-16T11:03:50Z', resueltoEn: '2026-09-16T11:04:02Z', usuarioId: 5 },
  ],
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas).find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};

const panel = {
  id: 2, numeroCuenta: '7037', tipo: 'hikvision', activo: true, ultimaSenalEn: '2026-09-16T19:05:00Z',
  sitioId: 2, sitioNombre: 'Oficina Falcon', sitioDireccion: 'Coro', clienteId: 1, clienteNombre: 'Falcon Seguridad Total',
  estadoArmado: 'armado' as const, ultimoMovimientoEn: '2026-09-16T19:02:00Z',
};
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <PanelHikvision panel={panel} alVolver={() => {}} />
  </QueryClientProvider>,
);
