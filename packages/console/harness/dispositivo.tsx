import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DetalleDispositivo } from '../src/vistas/Dispositivo.js';
import '../src/index.css';

const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
let id = 5000;
const ev = (min: number, categoria: string, codigo: string, descripcion: string, zona: string | null, zonaDescripcion: string | null, tipo: string, prioridad = 3) => ({
  id: id--, senalId: id, panelId: 92, numeroCuenta: '5137', prefijo: 'HIK', categoria, codigo, descripcion, particion: '01', zona, zonaDescripcion, prioridad, tipo, ocurridoEn: t(min),
});
const eventos = [
  ev(3, 'prueba', 'E602', 'Prueba periódica', null, null, 'prueba', 5),
  ev(9, 'restauracion', 'R354', 'Restauración: Falla al comunicar evento', null, null, 'restauracion'),
  ev(10, 'averia', 'E354', 'Falla al comunicar evento', null, null, 'averia'),
  ev(64, 'prueba', 'E602', 'Prueba periódica', null, null, 'prueba', 5),
  ev(122, 'cierre', 'R401', 'Cierre (armado): Apertura/Cierre por usuario — Ivo (cód. 1)', '001', null, 'apertura_cierre', 4),
  ev(410, 'apertura', 'E401', 'Apertura (desarmado): Apertura/Cierre por usuario — Ivo (cód. 1)', '001', null, 'apertura_cierre', 4),
  ev(415, 'restauracion', 'R130', 'Restauración: Robo', '003', 'Puerta depósito', 'restauracion'),
  ev(418, 'alarma', 'E130', 'Robo', '003', 'Puerta depósito', 'robo', 2),
  ev(700, 'restauracion', 'R301', 'Restauración: Falla de red eléctrica', null, null, 'restauracion'),
  ev(755, 'averia', 'E301', 'Falla de red eléctrica', null, null, 'averia'),
  ev(1500, 'sistema', 'SIS', 'Panel silencioso: sin señales hace 36 h', null, null, 'sistema', 2),
];
const panel = {
  id: 92, sitioId: 92, numeroCuenta: '5137', prefijo: 'HIK', tipo: 'hikvision', marca: 'Hikvision', modelo: 'DS-PHA20-W2P', supervisado: true, intervaloPruebaMin: 1440,
  ultimaSenalEn: t(3), activo: true, alias: 'Test Hikvision', propiedad: 'propio', frecuenciaMeses: 1, proximoVencimiento: null, montoAbono: null,
  sitioNombre: 'Test Hikvision', clienteId: 2, clienteNombre: 'Falcon Seguridad Total', ventanaCancelacionSeg: 25, enPruebaHasta: null,
};
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  let cuerpo: unknown = [];
  if (/\/paneles\/\d+\/estado/.test(url)) cuerpo = { particiones: [{ particion: 1, nombre: 'Casa', habilitada: true, estado: 'armado', enAlarma: false }], zonas: [], bateria: { porcentaje: 100, estado: 'normal' }, comunicaciones: { cable: 'normal', wifi: 'normal', senalWifi: 4, nube: 'normal' }, perifericos: [] };
  else if (url.includes('/paneles/estado')) cuerpo = [panel];
  else if (url.includes('/eventos')) cuerpo = eventos;
  else if (url.includes('/zonas')) cuerpo = [{ id: 1, panelId: 92, numero: '001', particion: '01', descripcion: 'Puerta entrada/salida' }, { id: 2, panelId: 92, numero: '003', particion: '01', descripcion: 'Puerta depósito' }];
  else if (url.includes('/clientes/')) cuerpo = { id: 2, nombre: 'Falcon Seguridad Total', contactos: [], sitios: [] };
  else if (url.includes('/comandos')) cuerpo = [];
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
if (new URLSearchParams(location.search).get('tema') === 'claro') document.documentElement.dataset.theme = 'light';
localStorage.setItem('monitoring.usuario', JSON.stringify({ id: 1, email: 'admin@monitoring.local', nombre: 'Administrador', rol: 'admin' }));
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="min-h-screen p-4 bg-fondo">
      <DetalleDispositivo panelId={92} alVolver={() => undefined} alIrACliente={() => undefined} />
    </div>
  </QueryClientProvider>,
);
setTimeout(() => document.querySelector('h3')?.closest('section')?.parentElement && window.scrollTo(0, document.body.scrollHeight), 900);
