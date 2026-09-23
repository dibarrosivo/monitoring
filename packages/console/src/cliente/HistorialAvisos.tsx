import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { guardarPreferenciasCliente, verEventosCliente, verPreferenciasCliente } from '../api.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PREFERENCIAS_POR_DEFECTO, quiereRecibir } from './preferencias.js';
import type { EventoCliente, PanelResumenCliente, PreferenciasAviso } from '../tipos.js';
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

export function avisosDeEventos(eventos: EventoCliente[], paneles: PanelResumenCliente[], prefs: PreferenciasAviso = PREFERENCIAS_POR_DEFECTO): AvisoHistorial[] {
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
    if (frase && quiereRecibir(prefs, { categoria: e.categoria, tono: frase.tono }, new Date(e.ocurridoEn))) lista.push({ ...frase, id: e.id, ocurridoEn: e.ocurridoEn });
  }
  return lista;
}

/** Cuántos avisos hay desde la última vez que se abrió la pestaña. */
export function useNoLeidos(paneles: PanelResumenCliente[] | undefined, activa: boolean): number {
  const { data: eventos } = useQuery({ queryKey: ['eventos-cli'], queryFn: () => verEventosCliente(), refetchInterval: 30_000 });
  const { data: prefs } = useQuery({ queryKey: ['preferencias-cli'], queryFn: verPreferenciasCliente, staleTime: 60_000 });
  return useMemo(() => {
    if (activa || !eventos || !paneles) return 0;
    const desde = vistoHasta();
    return avisosDeEventos(eventos, paneles, prefs).filter((a) => new Date(a.ocurridoEn).getTime() > desde).length;
  }, [eventos, paneles, prefs, activa]);
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
  const { data: prefs } = useQuery({ queryKey: ['preferencias-cli'], queryFn: verPreferenciasCliente, staleTime: 60_000 });
  const [configurando, setConfigurando] = useState(false);
  const desde = useMemo(() => vistoHasta(), []);
  // Abrir la pestaña deja todo como leído (al salir, el contador arranca de acá)
  useEffect(() => {
    marcarVisto();
    return marcarVisto;
  }, []);

  const avisos = useMemo(() => (eventos && paneles ? avisosDeEventos(eventos, paneles, prefs) : []), [eventos, paneles, prefs]);
  const porDia = useMemo(() => {
    const grupos = new Map<string, AvisoHistorial[]>();
    for (const a of avisos) {
      const k = etiquetaDia(a.ocurridoEn);
      grupos.set(k, [...(grupos.get(k) ?? []), a]);
    }
    return [...grupos.entries()];
  }, [avisos]);

  if (isLoading) return <p className="text-tenue">Cargando…</p>;

  const cabecera = (
    <div className="flex items-center gap-3">
      <h2 className="font-semibold flex-1">Avisos</h2>
      <button
        onClick={() => setConfigurando(!configurando)}
        className={`text-sm border rounded-sm px-2.5 py-1 ${configurando ? 'border-acento text-acento' : 'border-borde text-tenue hover:text-texto'}`}
      >
        ⚙ Qué recibir
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {cabecera}
      {configurando && <PreferenciasAvisos prefs={prefs ?? PREFERENCIAS_POR_DEFECTO} />}
      {avisos.length === 0 && (
        <p className="text-tenue">Todavía no hay avisos. Acá quedan las alarmas, los armados y desarmados y las fallas que la app le avisa.</p>
      )}
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

const GRUPOS: { clave: 'armadoDesarmado' | 'averias' | 'sistema'; titulo: string; detalle: string }[] = [
  { clave: 'armadoDesarmado', titulo: 'Armados y desarmados', detalle: 'Quién armó o desarmó y a qué hora' },
  { clave: 'averias', titulo: 'Fallas y restablecimientos', detalle: 'Luz, batería, comunicación, zonas anuladas' },
  { clave: 'sistema', titulo: 'Avisos de la central', detalle: 'Panel sin señales, horarios, mantenimiento' },
];

/**
 * Lo que el usuario elige recibir. Se guarda en el servidor: aplica en todos
 * sus teléfonos y también a los avisos push cuando existan. Emergencias y
 * alarmas no tienen interruptor: la app existe para eso.
 */
function PreferenciasAvisos({ prefs }: { prefs: PreferenciasAviso }) {
  const clienteConsultas = useQueryClient();
  const [silencio, setSilencio] = useState(Boolean(prefs.silencioDesde));
  const guardar = useMutation({
    mutationFn: (nuevas: PreferenciasAviso) => guardarPreferenciasCliente(nuevas),
    onSuccess: (guardadas) => clienteConsultas.setQueryData(['preferencias-cli'], guardadas),
  });
  const cambiar = (parte: Partial<PreferenciasAviso>) => guardar.mutate({ ...prefs, ...parte });

  return (
    <section className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-3 text-sm">
      <div className="flex items-start gap-3 border-b border-borde/60 pb-3">
        <span className="text-lg leading-none" aria-hidden>
          🚨
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Emergencias y alarmas</span>
          <span className="block text-tenue text-xs">Siempre llegan, incluso en la franja de silencio. No se pueden apagar.</span>
        </span>
        <span className="text-ok text-xs font-semibold uppercase">Siempre</span>
      </div>
      {GRUPOS.map((g) => (
        <label key={g.clave} className="flex items-start gap-3 cursor-pointer">
          <span className="flex-1">
            <span className="block font-semibold">{g.titulo}</span>
            <span className="block text-tenue text-xs">{g.detalle}</span>
          </span>
          <input
            type="checkbox"
            checked={prefs[g.clave]}
            onChange={(e) => cambiar({ [g.clave]: e.target.checked })}
            className="w-5 h-5 accent-[var(--color-acento)] mt-0.5"
            aria-label={g.titulo}
          />
        </label>
      ))}
      <div className="border-t border-borde/60 pt-3 flex flex-col gap-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <span className="flex-1">
            <span className="block font-semibold">Silencio nocturno</span>
            <span className="block text-tenue text-xs">En esta franja no avisa nada que no sea una alarma</span>
          </span>
          <input
            type="checkbox"
            checked={silencio}
            onChange={(e) => {
              setSilencio(e.target.checked);
              cambiar(e.target.checked ? { silencioDesde: prefs.silencioDesde ?? '22:00', silencioHasta: prefs.silencioHasta ?? '07:00' } : { silencioDesde: null, silencioHasta: null });
            }}
            className="w-5 h-5 accent-[var(--color-acento)] mt-0.5"
            aria-label="Silencio nocturno"
          />
        </label>
        {silencio && (
          <div className="flex items-center gap-2 font-datos text-sm pl-1">
            <span className="text-tenue">de</span>
            <input type="time" value={prefs.silencioDesde ?? '22:00'} onChange={(e) => cambiar({ silencioDesde: e.target.value, silencioHasta: prefs.silencioHasta ?? '07:00' })} className="bg-fondo border border-borde rounded-sm px-2 py-1" />
            <span className="text-tenue">a</span>
            <input type="time" value={prefs.silencioHasta ?? '07:00'} onChange={(e) => cambiar({ silencioDesde: prefs.silencioDesde ?? '22:00', silencioHasta: e.target.value })} className="bg-fondo border border-borde rounded-sm px-2 py-1" />
          </div>
        )}
      </div>
      {guardar.isError && <p className="text-prio1 text-xs">No se pudo guardar. Revise la conexión.</p>}
      {guardar.isSuccess && <p className="text-ok text-xs">Guardado. Aplica en todos sus teléfonos.</p>}
    </section>
  );
}
