import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { verEventosCliente } from '../api.js';
import type { EventoCliente, PanelResumenCliente } from '../tipos.js';
import { fraseParaEvento, type Frase } from './frases.js';

/**
 * Pestaña de avisos: lo mismo que la app dijo o mostró como emergente, pero
 * como historial, agrupado por día. Sale de los eventos del servidor pasados
 * por las mismas frases, así está completo aunque la app haya estado cerrada
 * cuando pasó. Lo no leído se cuenta desde la última vez que se abrió la
 * pestaña en este teléfono.
 */

const CLAVE_VISTO = 'monitoring.avisos.vistoHasta';

export function vistoHasta(): number {
  try {
    return Number(localStorage.getItem(CLAVE_VISTO) ?? 0);
  } catch {
    return 0;
  }
}

function marcarVisto(): void {
  try {
    localStorage.setItem(CLAVE_VISTO, String(Date.now()));
  } catch {
    // sin almacenamiento no hay contador de no leídos; la pestaña funciona igual
  }
}

interface AvisoHistorial extends Frase {
  id: number;
  ocurridoEn: string;
}

export function avisosDeEventos(eventos: EventoCliente[], paneles: PanelResumenCliente[]): AvisoHistorial[] {
  const sitios = new Set(paneles.map((p) => p.sitioId)).size;
  const porPanel = new Map(paneles.map((p) => [p.id, p]));
  const lista: AvisoHistorial[] = [];
  for (const e of eventos) {
    const p = e.panelId !== null ? porPanel.get(e.panelId) : undefined;
    const frase = fraseParaEvento(
      {
        eventoId: e.id,
        panelId: e.panelId,
        prioridad: 3,
        descripcion: e.descripcion,
        codigo: e.codigo,
        categoria: e.categoria,
        zona: e.zona,
        zonaDescripcion: e.zonaDescripcion,
        sitioNombre: p?.sitioNombre ?? null,
        prefijo: p?.prefijo ?? null,
        numeroCuenta: p?.numeroCuenta ?? null,
      },
      { nombrarSitio: sitios > 1 },
    );
    if (frase) lista.push({ ...frase, id: e.id, ocurridoEn: e.ocurridoEn });
  }
  return lista;
}

/** Cuántos avisos hay desde la última vez que se abrió la pestaña. */
export function useNoLeidos(paneles: PanelResumenCliente[] | undefined, activa: boolean): number {
  const { data: eventos } = useQuery({ queryKey: ['eventos-cli'], queryFn: () => verEventosCliente(), refetchInterval: 30_000 });
  return useMemo(() => {
    if (activa || !eventos || !paneles) return 0;
    const desde = vistoHasta();
    return avisosDeEventos(eventos, paneles).filter((a) => new Date(a.ocurridoEn).getTime() > desde).length;
  }, [eventos, paneles, activa]);
}

const ESTILO: Record<Frase['tono'], { icono: string; color: string }> = {
  emergencia: { icono: '🚨', color: 'text-prio1' },
  alarma: { icono: '⚠️', color: 'text-prio1' },
  aviso: { icono: 'ℹ️', color: 'text-prio2' },
  estado: { icono: '🔒', color: 'text-texto' },
  bien: { icono: '✅', color: 'text-ok' },
};

function etiquetaDia(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86_400_000);
  const mismo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismo(f, hoy)) return 'Hoy';
  if (mismo(f, ayer)) return 'Ayer';
  return f.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function HistorialAvisos({ paneles }: { paneles: PanelResumenCliente[] | undefined }) {
  const { data: eventos, isLoading } = useQuery({ queryKey: ['eventos-cli'], queryFn: () => verEventosCliente(), refetchInterval: 30_000 });
  const desde = useMemo(() => vistoHasta(), []);
  // Abrir la pestaña deja todo como leído (al salir, el contador arranca de acá)
  useEffect(() => {
    marcarVisto();
    return marcarVisto;
  }, []);

  const avisos = useMemo(() => (eventos && paneles ? avisosDeEventos(eventos, paneles) : []), [eventos, paneles]);
  const porDia = useMemo(() => {
    const grupos = new Map<string, AvisoHistorial[]>();
    for (const a of avisos) {
      const k = etiquetaDia(a.ocurridoEn);
      grupos.set(k, [...(grupos.get(k) ?? []), a]);
    }
    return [...grupos.entries()];
  }, [avisos]);

  if (isLoading) return <p className="text-tenue">Cargando…</p>;
  if (avisos.length === 0) return <p className="text-tenue">Todavía no hay avisos. Acá quedan las alarmas, los armados y desarmados y las fallas que la app le avisa.</p>;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {porDia.map(([dia, lista]) => (
        <section key={dia} className="flex flex-col gap-1.5">
          <h2 className="text-tenue text-xs uppercase tracking-wider">{dia}</h2>
          <ul className="bg-superficie border border-borde rounded-lg divide-y divide-borde/60">
            {lista.map((a) => {
              const s = ESTILO[a.tono];
              const nuevo = new Date(a.ocurridoEn).getTime() > desde;
              return (
                <li key={a.id} className={`px-3 py-2.5 flex items-start gap-3 ${nuevo ? '' : 'opacity-70'}`}>
                  <span className="text-lg leading-none pt-0.5" aria-hidden>
                    {s.icono}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${s.color} ${a.tono === 'emergencia' || a.tono === 'alarma' ? 'font-semibold' : ''}`}>{a.texto}</span>
                  </span>
                  <span className="font-datos text-xs text-tenue whitespace-nowrap pt-0.5">
                    {new Date(a.ocurridoEn).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    {nuevo && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-acento align-middle" aria-label="nuevo" />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
