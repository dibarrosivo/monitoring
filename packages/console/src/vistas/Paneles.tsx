import { useQuery } from '@tanstack/react-query';
import { listarPaneles } from '../api.js';
import type { EstadoPanel } from '../tipos.js';
import { transcurrido } from '../tiempo.js';

type Vida = 'al-dia' | 'demorado' | 'silencioso' | 'sin-datos';

function estadoVida(panel: EstadoPanel): Vida {
  if (!panel.ultimaSenalEn) return 'sin-datos';
  const minutos = (Date.now() - new Date(panel.ultimaSenalEn).getTime()) / 60_000;
  if (minutos <= panel.intervaloPruebaMin) return 'al-dia';
  if (minutos <= panel.intervaloPruebaMin * 1.5) return 'demorado';
  return 'silencioso';
}

const VIDA: Record<Vida, { nombre: string; led: string; texto: string }> = {
  'al-dia': { nombre: 'Al día', led: 'led-verde', texto: 'text-ok' },
  demorado: { nombre: 'Prueba demorada', led: '', texto: 'text-prio2' },
  silencioso: { nombre: 'Silencioso', led: 'led-rojo', texto: 'text-prio1' },
  'sin-datos': { nombre: 'Sin señales aún', led: '', texto: 'text-tenue' },
};

export function Paneles() {
  const { data: paneles, isLoading } = useQuery({
    queryKey: ['paneles'],
    queryFn: listarPaneles,
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-tenue">Cargando paneles…</p>;

  if ((paneles ?? []).length === 0) {
    return (
      <p className="text-tenue">
        Sin paneles dados de alta. Se cargan desde la vista Clientes, dentro de un sitio.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      {(paneles ?? []).map((panel) => {
        const vida = estadoVida(panel);
        const estilo = VIDA[vida];
        return (
          <li key={panel.id} className="bg-superficie border border-borde rounded-md p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-datos font-semibold text-lg">{panel.numeroCuenta}</span>
              <span className="flex items-center gap-2 text-xs">
                <span className={`led ${estilo.led || 'bg-prio2'}`} aria-hidden />
                <span className={estilo.texto}>{estilo.nombre}</span>
              </span>
            </div>
            <div className="text-sm text-tenue">
              {panel.tipo} · prueba cada {panel.intervaloPruebaMin} min
              {!panel.supervisado && ' · sin supervisión'}
            </div>
            <div className="font-datos text-xs text-tenue">
              {panel.ultimaSenalEn ? `última señal ${transcurrido(panel.ultimaSenalEn)}` : 'nunca transmitió'}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
