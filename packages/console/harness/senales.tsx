import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Eventos } from '../src/vistas/Eventos.js';
import '../src/index.css';

// Una tarde real de la central: señales de clientes, latidos y escáneres de internet mezclados
const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
let id = 900;
const ok = (min: number, fuente: string, remoto: string, cuenta: string, prefijo: string, cliente: string, cruda: string) => ({
  id: id--, fuente, remoto, cruda, estadoParse: 'ok', detalleError: null, panelId: 1, recibidaEn: t(min), numeroCuenta: cuenta, prefijo, clienteNombre: cliente,
});
const latido = (min: number, fuente: string, remoto: string, cruda: string) => ({
  id: id--, fuente, remoto, cruda, estadoParse: 'ignorada', detalleError: 'latido del receptor', panelId: null, recibidaEn: t(min), numeroCuenta: null, prefijo: null, clienteNombre: null,
});
const escaneo = (min: number, fuente: string, remoto: string, motivo: string, cruda: string) => ({
  id: id--, fuente, remoto, cruda, estadoParse: 'ignorada', detalleError: `escaneo de internet: ${motivo}`, panelId: null, recibidaEn: t(min), numeroCuenta: null, prefijo: null, clienteNombre: null,
});
const senales = [
  latido(1, 'surgard-tcp', '::ffff:156.67.31.152:51442', '1011 @'),
  ok(3, 'pima-bridge', 'puente-pima-central', '7006', 'AL', 'GERALDS C.A.', '1061 7006 TH'),
  escaneo(4, 'dc09-tcp', '::ffff:147.182.225.86:47298', 'petición HTTP', 'GET / HTTP/1.1 Host: 37.60.234.77 User-Agent: Mozilla/5.0 (Windows NT 6.1)'),
  ok(6, 'dc09-tcp', '::ffff:190.202.14.77:2051', '7001', 'HIK', 'VANGAT', '\n5C3A0032"ADM-CID"0043L0#7001[#7001|1401 01 003]_18:27:41,09-21-2026\r'),
  latido(6, 'surgard-tcp', '::ffff:156.67.31.152:51442', '1011 @'),
  ok(8, 'pima-bridge', 'puente-pima-central', '7054', 'AL', 'GERALDS CAFE', '1061 7054 SX'),
  escaneo(9, 'dc09-udp', '::ffff:87.106.201.248:5060', 'sondeo SIP', 'INVITE sip:37.60.234.77 SIP/2.0 Via: SIP/2.0/UDP 87.106.201.248:5060'),
  ok(11, 'pima-bridge', 'puente-pima-central', '7048', 'AL', 'COMERCIAL GALIVEN', '1061 7048 AQ'),
  latido(11, 'surgard-tcp', '::ffff:156.67.31.152:51442', '1011 @'),
  ok(12, 'surgard-tcp', '::ffff:156.67.31.152:51442', '7037', 'EBS', 'Unidad Educativa Colegio Matarile', '5011 187037E60200000'),
  escaneo(14, 'dc09-tcp', '::ffff:45.135.193.198:39102', 'saludo TLS', '\x16\x03\x01\x02\x00\x01\x00\x01\xfc\x03\x03'),
  ok(15, 'dc09-tcp', '::ffff:190.202.14.77:2051', '7001', 'HIK', 'VANGAT', '\n8A3B0032"ADM-CID"0042L0#7001[#7001|3401 01 003]_18:18:02,09-21-2026\r'),
  latido(16, 'surgard-tcp', '::ffff:156.67.31.152:51442', '1011 @'),
  ok(19, 'pima-bridge', 'puente-pima-central', '7016', 'AL', 'FERRETERIA PEPINO', '1061 7016 TH'),
  escaneo(20, 'pima-bridge', '::ffff:94.154.43.7:60322', 'sondeo Zabbix', 'ZBXD'),
  latido(21, 'surgard-tcp', '::ffff:156.67.31.152:51442', '1011 @'),
  ok(24, 'pima-bridge', 'puente-pima-central', '7075', 'AL', 'ROMULO REYES', '1061 7075 QT'),
  escaneo(25, 'dc09-tcp', '::ffff:18.116.101.220:44120', 'petición HTTP', 'GET /robots.txt HTTP/1.1 Host: 37.60.234.77:9999 User-Agent: visionheight.com/scan'),
  latido(26, 'surgard-tcp', '::ffff:156.67.31.152:51442', '1011 @'),
  ok(29, 'pima-bridge', 'puente-pima-central', '7031', 'AL', 'FARMACIA LA COSTA', '1061 7031 SP'),
];
window.fetch = async (entrada: RequestInfo | URL) => {
  const url = String(entrada);
  const cuerpo = url.includes('/senales') ? senales : [];
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
};
localStorage.setItem('monitoring.token', 'x');
if (new URLSearchParams(location.search).get('tema') === 'claro') document.documentElement.dataset.theme = 'light';
createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="min-h-screen p-4 bg-fondo">
      <Eventos solapaInicial="senales" />
    </div>
  </QueryClientProvider>,
);
// #todo muestra también latidos y escaneos
setTimeout(() => {
  if (location.hash === '#todo') (document.querySelector('input[type=checkbox]') as HTMLInputElement | null)?.click();
}, 700);
