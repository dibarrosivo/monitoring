import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarPaneles } from '../api.js';
import type { EstadoPanel } from '../tipos.js';
import { transcurrido } from '../tiempo.js';
import { DetalleDispositivo } from './Dispositivo.js';

type Vida = 'al-dia' | 'demorado' | 'silencioso' | 'sin-datos';

function estadoVida(panel: EstadoPanel): Vida {
  if (!panel.ultimaSenalEn) return 'sin-datos';
  const minutos = (Date.now() - new Date(panel.ultimaSenalEn).getTime()) / 60_000;
  if (minutos <= panel.intervaloPruebaMin) return 'al-dia';
  if (minutos <= panel.intervaloPruebaMin * 1.5) return 'demorado';
  return 'silencioso';
}

const VIDA: Record<Vida, { nombre: string; clase: string; orden: number }> = {
  silencioso: { nombre: 'SILENCIOSO', clase: 'text-prio1', orden: 0 },
  demorado: { nombre: 'Demorado', clase: 'text-prio2', orden: 1 },
  'sin-datos': { nombre: 'Sin señales', clase: 'text-tenue', orden: 2 },
  'al-dia': { nombre: 'Al día', clase: 'text-ok', orden: 3 },
};

const ARMADO = {
  armado: { texto: '🔒 Armado', clase: 'text-ok' },
  desarmado: { texto: '🔓 Desarmado', clase: 'text-prio2' },
  desconocido: { texto: '—', clase: 'text-tenue' },
} as const;

/**
 * Lista de dispositivos con lo esencial antes de abrir nada: de quién es,
 * si está vivo, si está armado y cuándo habló por última vez. Los problemas
 * primero. La fila lleva al cliente.
 */
export function Paneles({
  alIrACliente,
  dispositivoInicial = null,
}: {
  alIrACliente: (clienteId: number) => void;
  dispositivoInicial?: number | null;
}) {
  const { data: paneles, isLoading } = useQuery({
    queryKey: ['paneles'],
    queryFn: listarPaneles,
    refetchInterval: 30_000,
  });
  const [filtro, setFiltro] = useState('');
  const [seleccionado, setSeleccionado] = useState<number | null>(dispositivoInicial);

  // Otras vistas pueden pedir abrir un dispositivo puntual
  useEffect(() => {
    if (dispositivoInicial !== null) setSeleccionado(dispositivoInicial);
  }, [dispositivoInicial]);

  if (isLoading) return <p className="text-tenue">Cargando dispositivos…</p>;

  if (seleccionado !== null) {
    return <DetalleDispositivo panelId={seleccionado} alVolver={() => setSeleccionado(null)} alIrACliente={alIrACliente} />;
  }

  const termino = filtro.trim().toLowerCase();
  const visibles = (paneles ?? [])
    .filter(
      (p) =>
        !termino ||
        p.numeroCuenta.toLowerCase().includes(termino) ||
        p.clienteNombre?.toLowerCase().includes(termino) ||
        p.sitioNombre?.toLowerCase().includes(termino),
    )
    .sort((a, b) => VIDA[estadoVida(a)].orden - VIDA[estadoVida(b)].orden || a.numeroCuenta.localeCompare(b.numeroCuenta));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por cuenta, cliente o sitio…"
          className="bg-superficie border border-borde rounded-sm px-3 py-1.5 text-sm w-72"
        />
        <span className="text-tenue text-sm">
          {visibles.length} de {(paneles ?? []).length} dispositivos
        </span>
      </div>

      <div className="bg-superficie border border-borde rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-tenue text-xs uppercase tracking-wider border-b border-borde">
              <th className="px-3 py-2 font-medium">Cuenta</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Sitio</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Armado</th>
              <th className="px-3 py-2 font-medium">Vida</th>
              <th className="px-3 py-2 font-medium">Última señal</th>
              <th className="px-3 py-2 font-medium">Prueba</th>
            </tr>
          </thead>
          <tbody className="font-datos">
            {visibles.map((panel) => {
              const vida = VIDA[estadoVida(panel)];
              const armado = ARMADO[panel.estadoArmado ?? 'desconocido'];
              return (
                <tr
                  key={panel.id}
                  onClick={() => setSeleccionado(panel.id)}
                  className={`border-b border-borde/50 last:border-0 cursor-pointer hover:bg-superficie-2/60 ${
                    panel.activo ? '' : 'opacity-50'
                  }`}
                >
                  <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                    {panel.numeroCuenta}
                    {!panel.activo && <span className="text-prio2 text-xs font-ui"> INACTIVO</span>}
                  </td>
                  <td className="px-3 py-1.5 font-ui">{panel.clienteNombre ?? '—'}</td>
                  <td className="px-3 py-1.5 font-ui text-tenue">{panel.sitioNombre ?? '—'}</td>
                  <td className="px-3 py-1.5 text-tenue">{panel.tipo}</td>
                  <td className={`px-3 py-1.5 font-ui whitespace-nowrap ${armado.clase}`}>{armado.texto}</td>
                  <td className={`px-3 py-1.5 text-xs font-semibold ${vida.clase}`}>
                    {panel.supervisado ? vida.nombre : 'sin supervisión'}
                  </td>
                  <td className="px-3 py-1.5 text-tenue whitespace-nowrap">
                    {panel.ultimaSenalEn ? transcurrido(panel.ultimaSenalEn) : 'nunca'}
                  </td>
                  <td className="px-3 py-1.5 text-tenue whitespace-nowrap">cada {panel.intervaloPruebaMin} min</td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-tenue font-ui">
                  {termino ? 'Ningún dispositivo coincide con el filtro.' : 'Sin dispositivos dados de alta.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
