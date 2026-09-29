import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enviarComando, estadoDetallado, listarComandos, verEventosCliente } from '../api.js';
import type { AccionComando, EstadoDetalladoPanel, EstadoZonaPanel, PanelResumenCliente } from '../tipos.js';
import { VAR_TIPO, nombreCuenta, tipoDe } from '../ui.js';
import { IconoAlerta, IconoCandado, IconoCandadoAbierto, IconoCasa, IconoFuego, IconoOjo, IconoPuerta } from './Iconos.js';

/**
 * La pantalla del panel para equipos Hikvision, con la lógica de la app del
 * fabricante: el estado grande arriba, los tres modos como botones, y abajo
 * lo que el panel sabe de sí mismo (zonas, batería, conexión) y lo que pasó.
 *
 * Es deliberadamente clara sobre fondo claro, distinta del resto de la app:
 * es "el panel", no la central. Todo lo que muestra sale del propio equipo,
 * consultado en el momento; nada es un recuerdo nuestro de lo que pedimos.
 */

type Modo = 'armado' | 'armado_casa' | 'desarmado' | 'armando';

const MODO: Record<Modo, { titulo: string; frase: string; color: string; fondo: string }> = {
  armado: { titulo: 'Armado', frase: 'Modo ausente. Todas las zonas protegidas.', color: 'var(--color-prio3)', fondo: 'color-mix(in srgb, var(--color-prio3) 14%, transparent)' },
  armado_casa: { titulo: 'Armado en casa', frase: 'Perímetro protegido, interior libre.', color: 'var(--color-ok)', fondo: 'color-mix(in srgb, var(--color-ok) 14%, transparent)' },
  desarmado: { titulo: 'Desarmado', frase: 'El sistema no está vigilando.', color: 'var(--color-tenue)', fondo: 'color-mix(in srgb, var(--color-tenue) 14%, transparent)' },
  armando: { titulo: 'Armando…', frase: 'Retardo de salida en curso.', color: 'var(--color-prio2)', fondo: 'color-mix(in srgb, var(--color-prio2) 14%, transparent)' },
};

const ACCIONES: { accion: AccionComando; titulo: string; Icono: (p: { className?: string }) => ReactElement; modo: Modo }[] = [
  { accion: 'armar', titulo: 'Ausente', Icono: IconoCandado, modo: 'armado' },
  { accion: 'armar_casa', titulo: 'En casa', Icono: IconoCasa, modo: 'armado_casa' },
  { accion: 'desarmar', titulo: 'Desarmar', Icono: IconoCandadoAbierto, modo: 'desarmado' },
];

const ZONA: Record<EstadoZonaPanel['estado'], { texto: string; color: string }> = {
  normal: { texto: 'Normal', color: 'var(--color-ok)' },
  activa: { texto: 'Activa', color: 'var(--color-prio1)' },
  anulada: { texto: 'Anulada', color: 'var(--color-prio2)' },
  sabotaje: { texto: 'Sabotaje', color: 'var(--color-prio1)' },
  sin_conexion: { texto: 'Sin conexión', color: 'var(--color-tenue)' },
  falla: { texto: 'Falla', color: 'var(--color-prio2)' },
};

const TIPO_ZONA: Record<string, string> = {
  Delay: 'Retardada',
  Instant: 'Instantánea',
  Follow: 'Seguidora',
  '24hNonAlarm': '24 h',
  Fire: 'Incendio',
  Panic: 'Pánico',
  Medical: 'Médica',
  Emergency: 'Emergencia',
  Key: 'Llave',
  Perimeter: 'Perímetro',
};

export function PanelHikvision({ panel, alVolver }: { panel: PanelResumenCliente; alVolver: () => void }) {
  const clienteConsultas = useQueryClient();
  const { data: estado, isLoading, error, refetch } = useQuery({
    queryKey: ['estado-panel', panel.id],
    queryFn: () => estadoDetallado(panel.id),
    refetchInterval: 30_000,
    retry: 1,
  });
  const { data: eventos } = useQuery({ queryKey: ['eventos-cli', panel.id], queryFn: () => verEventosCliente(panel.id), refetchInterval: 30_000 });
  const { data: comandos } = useQuery({ queryKey: ['comandos', panel.id], queryFn: () => listarComandos(panel.id), refetchInterval: 15_000 });

  const [confirmarDesarme, setConfirmarDesarme] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: (accion: AccionComando) => enviarComando(panel.id, accion),
    onSuccess: (r) => {
      setAviso(r.aceptado ? 'Orden enviada. El panel confirma en unos segundos…' : `El panel no aceptó la orden: ${r.detalle ?? 'sin detalle'}`);
      void clienteConsultas.invalidateQueries({ queryKey: ['comandos', panel.id] });
      // El panel tarda un momento en cambiar de estado: se vuelve a preguntar dos veces
      setTimeout(() => void refetch(), 3_000);
      setTimeout(() => void refetch(), 8_000);
    },
    onError: (e) => setAviso(e instanceof Error ? e.message : 'No se pudo enviar la orden'),
  });
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 10_000);
    return () => clearTimeout(t);
  }, [aviso]);

  const particion = estado?.particiones.find((p) => p.habilitada) ?? estado?.particiones[0];
  const modo: Modo = particion?.estado ?? (panel.estadoArmado === 'armado' ? 'armado' : 'desarmado');
  const enAlarma = Boolean(particion?.enAlarma || estado?.zonas.some((z) => z.enAlarma));
  const m = MODO[modo];

  function pedir(accion: AccionComando) {
    if (accion === 'desarmar' && !confirmarDesarme) {
      setConfirmarDesarme(true);
      return;
    }
    setConfirmarDesarme(false);
    enviar.mutate(accion);
  }

  return (
    <div className="min-h-screen flex flex-col bg-fondo text-texto">
      <header className="px-4 py-3 flex items-center gap-3 bg-superficie border-b border-borde">
        <button onClick={alVolver} aria-label="Volver" className="text-2xl leading-none px-1 text-acento">
          ‹
        </button>
        <div className="min-w-0">
          <h1 className="font-semibold text-base truncate">{panel.sitioNombre}</h1>
          <p className="text-xs truncate text-tenue">
            Hikvision {nombreCuenta(panel.prefijo, panel.numeroCuenta)}
            {panel.ultimaSenalEn && ` · en línea`}
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto p-4 flex flex-col gap-4 pb-24">
        {/* Estado grande */}
        <section className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center bg-superficie border border-borde">
          <div
            className="w-40 h-40 rounded-full flex flex-col items-center justify-center"
            style={{ background: enAlarma ? 'color-mix(in srgb, var(--color-prio1) 15%, transparent)' : m.fondo, border: `6px solid ${enAlarma ? 'var(--color-prio1)' : m.color}` }}
          >
            <span className="text-4xl" aria-hidden>
              {enAlarma ? <IconoAlerta className="w-10 h-10" grueso={1.6} /> : modo === 'desarmado' ? <IconoCandadoAbierto className="w-10 h-10" grueso={1.6} /> : modo === 'armado_casa' ? <IconoCasa className="w-10 h-10" grueso={1.6} /> : <IconoCandado className="w-10 h-10" grueso={1.6} />}
            </span>
            <span className="font-semibold mt-1" style={{ color: enAlarma ? 'var(--color-prio1)' : m.color }}>
              {enAlarma ? 'EN ALARMA' : m.titulo}
            </span>
          </div>
          <p className="text-sm text-tenue">
            {isLoading ? 'Consultando el panel…' : error ? 'No se pudo consultar el panel ahora.' : enAlarma ? 'Hay una alarma activa en el sistema.' : m.frase}
          </p>
          {particion?.nombre && estado!.particiones.filter((p) => p.habilitada).length > 1 && (
            <p className="text-xs text-tenue">Partición {particion.nombre}</p>
          )}
        </section>

        {/* Los tres modos */}
        <section className="grid grid-cols-3 gap-3">
          {ACCIONES.map((a) => {
            const activo = modo === a.modo;
            return (
              <button
                key={a.accion}
                onClick={() => pedir(a.accion)}
                disabled={enviar.isPending || !panel.activo}
                className="rounded-2xl py-4 flex flex-col items-center gap-1.5 font-semibold text-sm disabled:opacity-50"
                style={{
                  background: activo ? MODO[a.modo].color : 'var(--color-superficie)',
                  color: activo ? 'var(--color-superficie)' : 'var(--color-texto)',
                  boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)',
                  border: `1px solid ${activo ? MODO[a.modo].color : 'var(--color-borde)'}`,
                }}
              >
                <a.Icono className="w-7 h-7" />
                {a.titulo}
              </button>
            );
          })}
        </section>
        {confirmarDesarme && (
          <div className="rounded-xl p-3 flex items-center gap-3 text-sm" style={{ background: 'color-mix(in srgb, var(--color-prio2) 14%, transparent)', border: '1px solid #C47F12' }}>
            <span className="flex-1">¿Desarmar el sistema? El sitio queda sin protección.</span>
            <button onClick={() => setConfirmarDesarme(false)} className="px-3 py-1.5 rounded-lg text-tenue">
              No
            </button>
            <button onClick={() => pedir('desarmar')} className="px-3 py-1.5 rounded-lg font-semibold text-white" style={{ background: 'var(--color-prio2)' }}>
              Sí, desarmar
            </button>
          </div>
        )}
        {aviso && (
          <p className="text-sm text-center" style={{ color: 'var(--color-acento)' }}>
            {aviso}
          </p>
        )}

        {/* Salud del panel */}
        {estado && (
          <section className="grid grid-cols-3 gap-3">
            <Chip
              titulo="Batería"
              valor={estado.bateria ? `${estado.bateria.porcentaje}%` : '—'}
              bien={!estado.bateria || estado.bateria.estado === 'normal'}
            />
            <Chip
              titulo="Conexión"
              valor={
                estado.comunicaciones?.wifi === 'normal'
                  ? `Wi‑Fi ${'▂▄▆█'.slice(0, Math.max(1, Math.min(4, estado.comunicaciones.senalWifi ?? 4)))}`
                  : estado.comunicaciones?.cable === 'normal'
                    ? 'Cable'
                    : 'Sin red'
              }
              bien={estado.comunicaciones?.wifi === 'normal' || estado.comunicaciones?.cable === 'normal'}
            />
            <Chip titulo="Nube" valor={estado.comunicaciones?.nube === 'normal' ? 'Conectada' : 'Sin nube'} bien={estado.comunicaciones?.nube === 'normal'} />
          </section>
        )}

        {/* Zonas */}
        {estado && estado.zonas.length > 0 && (
          <section className="rounded-2xl overflow-hidden bg-superficie border border-borde">
            <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold text-tenue">
              Zonas
            </h2>
            <ul>
              {estado.zonas.map((z) => {
                const e = ZONA[z.estado];
                return (
                  <li key={z.numero} className="px-4 py-2.5 flex items-center gap-3 border-t border-borde/60">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm bg-superficie-2" aria-hidden>
                      {z.tipo === 'Fire' ? <IconoFuego className="w-4 h-4" /> : z.tipo === 'Delay' ? <IconoPuerta className="w-4 h-4" /> : <IconoOjo className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{z.nombre}</span>
                      <span className="block text-xs truncate text-tenue">
                        {z.descripcion ?? (z.tipo ? (TIPO_ZONA[z.tipo] ?? z.tipo) : '')}
                        {z.armada && ' · armada'}
                      </span>
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: e.color, background: `color-mix(in srgb, ${e.color} 12%, transparent)` }}>
                      {e.texto}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Periféricos con novedad */}
        {estado && estado.perifericos.some((p) => p.sabotaje || (p.estado !== 'online' && p.estado !== 'off')) && (
          <section className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in srgb, var(--color-prio2) 14%, transparent)', border: '1px solid #C47F12' }}>
            {estado.perifericos
              .filter((p) => p.sabotaje || (p.estado !== 'online' && p.estado !== 'off'))
              .map((p) => (
                <p key={`${p.tipo}-${p.nombre}`}>
                  {p.nombre}: {p.sabotaje ? 'sabotaje' : p.estado}
                </p>
              ))}
          </section>
        )}

        {/* Últimos eventos */}
        <section className="rounded-2xl overflow-hidden bg-superficie border border-borde">
          <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold text-tenue">
            Actividad reciente
          </h2>
          <ul>
            {(eventos ?? []).slice(0, 20).map((ev) => (
              <li key={ev.id} className="px-4 py-2.5 flex items-start gap-3 text-sm border-t border-borde/60">
                <span className="text-xs whitespace-nowrap pt-0.5 tabular-nums text-tenue">
                  {new Date(ev.ocurridoEn).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: VAR_TIPO[tipoDe(ev)] }} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ color: tipoDe(ev) === 'emergencia' || tipoDe(ev) === 'robo' ? VAR_TIPO[tipoDe(ev)] : 'var(--color-texto)', fontWeight: tipoDe(ev) === 'emergencia' || tipoDe(ev) === 'robo' ? 600 : 400 }}>
                    {ev.descripcion}
                  </span>
                  {ev.zona && (
                    <span className="block text-xs text-tenue">
                      {['apertura', 'cierre', 'cancelacion'].includes(ev.categoria) ? 'usuario' : 'zona'} {Number(ev.zona) || ev.zona}
                      {ev.zonaDescripcion && ` · ${ev.zonaDescripcion}`}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {(eventos ?? []).length === 0 && (
              <li className="px-4 py-3 text-sm text-tenue">
                Sin actividad registrada todavía.
              </li>
            )}
          </ul>
        </section>

        {/* Órdenes enviadas desde la app */}
        {(comandos ?? []).length > 0 && (
          <section className="rounded-2xl overflow-hidden bg-superficie border border-borde">
            <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold text-tenue">
              Órdenes enviadas
            </h2>
            <ul>
              {comandos!.slice(0, 5).map((c) => (
                <li key={c.id} className="px-4 py-2 flex items-center gap-3 text-sm border-t border-borde/60">
                  <span className="text-xs tabular-nums text-tenue">
                    {new Date(c.creadoEn).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="flex-1">
                    {c.accion === 'armar' ? 'Armar (ausente)' : c.accion === 'armar_casa' ? 'Armar en casa' : 'Desarmar'}
                    {c.usuarioNombre && <span> · {c.usuarioNombre}</span>}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: c.estado === 'confirmado' ? 'var(--color-ok)' : c.estado === 'fallido' ? 'var(--color-prio1)' : 'var(--color-prio2)' }}
                  >
                    {c.estado === 'confirmado' ? 'Confirmado por el panel' : c.estado === 'fallido' ? 'Rechazado' : c.estado === 'enviado' ? 'Esperando al panel' : 'Pendiente'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function Chip({ titulo, valor, bien }: { titulo: string; valor: string; bien: boolean }) {
  return (
    <div className="rounded-2xl px-3 py-2.5 text-center bg-superficie border border-borde">
      <p className="text-[11px] uppercase tracking-wider text-tenue">
        {titulo}
      </p>
      <p className="text-sm font-semibold" style={{ color: bien ? 'var(--color-texto)' : 'var(--color-prio1)' }}>
        {valor}
      </p>
    </div>
  );
}
