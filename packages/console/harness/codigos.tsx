import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Codigos } from '../src/vistas/Codigos.js';
import '../src/index.css';

/* Datos inventados: nunca clientes reales en un harness. */
const FILAS = [
  { panelId: 1, numeroCuenta: '5102', prefijo: 'AL', clienteNombre: 'PANADERIA LA ESPIGA', sitioNombre: 'Local principal', codigo: '003', eventos: 34, ultimoEn: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { panelId: 2, numeroCuenta: '5126', prefijo: 'AL', clienteNombre: 'COMERCIAL ANDINA', sitioNombre: 'Depósito Norte', codigo: '001', eventos: 23, ultimoEn: new Date(Date.now() - 9 * 3600_000).toISOString() },
  { panelId: 3, numeroCuenta: '5154', prefijo: 'HIK', clienteNombre: 'Café del Faro', sitioNombre: 'Café del Faro', codigo: '623', eventos: 21, ultimoEn: new Date(Date.now() - 26 * 3600_000).toISOString() },
  { panelId: 4, numeroCuenta: '5190', prefijo: 'AL', clienteNombre: 'FARMACIA VIDA', sitioNombre: 'Sucursal centro', codigo: '004', eventos: 9, ultimoEn: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { panelId: 5, numeroCuenta: '5177', prefijo: 'AL', clienteNombre: 'FERRETERIA EL TORNILLO', sitioNombre: 'Galpón', codigo: '020', eventos: 2, ultimoEn: new Date(Date.now() - 6 * 86400_000).toISOString() },
];

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
cliente.setQueryData(['codigos-sin-nombre'], FILAS);

createRoot(document.getElementById('raiz')!).render(
  <QueryClientProvider client={cliente}>
    <div className="bg-fondo text-texto min-h-screen p-6">
      <Codigos />
    </div>
  </QueryClientProvider>,
);
