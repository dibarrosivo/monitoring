import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Cobros } from '../src/vistas/Cobros.js';
import '../src/index.css';

const tasa = { valor: 855.6625, fechaValor: '2026-09-25', fuente: 'bcv', obtenidoEn: '2026-09-24T20:00:00Z' };
const cuota = (id: number, concepto: string, desde: string, hasta: string, vence: string, monto: number, pagado: number, estado: string, cuenta = '7002') => ({
  id, panelId: 3, numeroCuenta: cuenta, prefijo: 'AL', concepto, periodoDesde: desde, periodoHasta: hasta, venceEn: vence, montoUsd: monto, pagadoUsd: pagado, estado,
});
const respuestas: Record<string, unknown> = {
  '/cobros/resumen': { morosos: 3, vencidoUsd: 185, pendienteUsd: 640, porVencer: 12, cobradoMesUsd: 1275, facturadoMesUsd: 1590, tasa },
  '/cobros/clientes/1': {
    cliente: { id: 1, nombre: 'PANADERIA K3', exonerado: false },
    dispositivos: [
      { panelId: 3, numeroCuenta: '7002', prefijo: 'AL', sitioNombre: 'Panadería K3 · Centro', activo: true, exonerado: false, planId: 1, planNombre: 'Comercial', planPrecioUsd: 25, montoAbono: null, precioUsd: 25, meses: 1, proximoVencimiento: '2026-10-01' },
      { panelId: 4, numeroCuenta: '7003', prefijo: 'AL', sitioNombre: 'Depósito', activo: true, exonerado: false, planId: 1, planNombre: 'Comercial', planPrecioUsd: 25, montoAbono: 20, precioUsd: 20, meses: 1, proximoVencimiento: '2026-10-01' },
    ],
    cuotas: [
      cuota(9, 'Mensualidad de septiembre 2026', '2026-09-01', '2026-09-30', '2026-09-06', 25, 0, 'pendiente'),
      cuota(10, 'Mensualidad de septiembre 2026', '2026-09-01', '2026-09-30', '2026-09-06', 20, 0, 'pendiente', '7003'),
      cuota(7, 'Mensualidad de agosto 2026', '2026-08-01', '2026-08-31', '2026-08-06', 25, 25, 'pagada'),
      cuota(8, 'Mensualidad de agosto 2026', '2026-08-01', '2026-08-31', '2026-08-06', 20, 20, 'pagada', '7003'),
      cuota(5, 'Mensualidad de julio 2026', '2026-07-01', '2026-07-31', '2026-07-06', 25, 25, 'pagada'),
    ],
    pagos: [
      { id: 2, montoUsd: 45, montoBs: 37200.5, tasa: 826.68, forma: 'pago_movil', referencia: '4471', fecha: '2026-08-03', nota: null, estado: 'confirmado', registradoPorNombre: 'Frandder', creadoEn: '2026-08-03T14:00:00Z' },
      { id: 1, montoUsd: 25, montoBs: null, tasa: null, forma: 'zelle', referencia: null, fecha: '2026-07-02', nota: 'pagó el hijo', estado: 'confirmado', registradoPorNombre: 'Admin', creadoEn: '2026-07-02T14:00:00Z' },
    ],
    pendienteUsd: 45,
    vencidoUsd: 45,
    saldoAFavorUsd: 0,
    tasa,
  },
  '/cobros/clientes': [
    { clienteId: 1, nombre: 'PANADERIA K3', telefono: null, exonerado: false, dispositivos: 2, pendienteUsd: 45, vencidoUsd: 45, cuotasVencidas: 2, proximaVence: '2026-09-06', ultimoPago: '2026-08-03' },
    { clienteId: 2, nombre: 'COMERCIAL GALIVEN', telefono: null, exonerado: false, dispositivos: 1, pendienteUsd: 90, vencidoUsd: 90, cuotasVencidas: 3, proximaVence: '2026-07-06', ultimoPago: '2026-06-10' },
    { clienteId: 3, nombre: 'FARMACIA LA COSTA', telefono: null, exonerado: false, dispositivos: 1, pendienteUsd: 50, vencidoUsd: 50, cuotasVencidas: 1, proximaVence: '2026-09-06', ultimoPago: '2026-08-28' },
    { clienteId: 4, nombre: 'FERRETERIA PEPINO', telefono: null, exonerado: false, dispositivos: 1, pendienteUsd: 25, vencidoUsd: 0, cuotasVencidas: 0, proximaVence: '2026-10-06', ultimoPago: '2026-09-02' },
    { clienteId: 5, nombre: 'LICORERIA EL SOL', telefono: null, exonerado: false, dispositivos: 1, pendienteUsd: 0, vencidoUsd: 0, cuotasVencidas: 0, proximaVence: null, ultimoPago: '2026-09-20' },
    { clienteId: 6, nombre: 'ROMULO REYES', telefono: null, exonerado: true, dispositivos: 3, pendienteUsd: 0, vencidoUsd: 0, cuotasVencidas: 0, proximaVence: null, ultimoPago: '2026-09-15' },
  ],
  '/planes': [
    { id: 1, nombre: 'Comercial', precioUsd: 25, frecuenciaMeses: 1, descripcion: 'Monitoreo 24 h y app', activo: true },
    { id: 2, nombre: 'Residencial', precioUsd: 15, frecuenciaMeses: 1, descripcion: null, activo: true },
    { id: 3, nombre: 'Anual comercial', precioUsd: 250, frecuenciaMeses: 12, descripcion: 'dos meses de descuento', activo: false },
  ],
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const clave = Object.keys(respuestas)
    .sort((a, b) => b.length - a.length)
    .find((k) => url.includes(k)) ?? '';
  return new Response(JSON.stringify(respuestas[clave] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
if (new URLSearchParams(location.search).get('tema') === 'claro') localStorage.setItem('monitoring.tema', 'claro');
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="min-h-screen p-4 bg-fondo">
      <Cobros clienteInicial={1} />
    </div>
  </QueryClientProvider>,
);
// #pago abre el formulario de pago; #planes muestra los planes
setTimeout(() => {
  if (location.hash === '#pago') [...document.querySelectorAll('button')].find((b) => b.textContent === 'Registrar pago')?.click();
  if (location.hash === '#planes') [...document.querySelectorAll('button')].find((b) => b.textContent === 'Planes')?.click();
}, 700);
