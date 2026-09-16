import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enviarComando, estadoDetallado, listarComandos, verEventosCliente } from '../api.js';
import type { AccionComando, EstadoDetalladoPanel, EstadoZonaPanel, PanelResumenCliente } from '../tipos.js';

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
  armado: { titulo: 'Armado', frase: 'Modo ausente. Todas las zonas protegidas.', color: '#1E6EF0', fondo: '#E7F0FE' },
  armado_casa: { titulo: 'Armado en casa', frase: 'Perímetro protegido, interior libre.', color: '#0F8A6B', fondo: '#E3F5EF' },
  desarmado: { titulo: 'Desarmado', frase: 'El sistema no está vigilando.', color: '#6B7280', fondo: '#F1F3F6' },
  armando: { titulo: 'Armando…', frase: 'Retardo de salida en curso.', color: '#C47F12', fondo: '#FDF2DF' },
};

const ACCIONES: { accion: AccionComando; titulo: string; icono: string; modo: Modo }[] = [
  { accion: 'armar', titulo: 'Ausente', icono: '🔒', modo: 'armado' },
  { accion: 'armar_casa', titulo: 'En casa', icono: '🏠', modo: 'armado_casa' },
  { accion: 'desarmar', titulo: 'Desarmar', icono: '🔓', modo: 'desarmado' },
];

const ZONA: Record<EstadoZonaPanel['estado'], { texto: string; color: string }> = {
  normal: { texto: 'Normal', color: '#0F8A6B' },
  activa: { texto: 'Activa', color: '#D93025' },
  anulada: { texto: 'Anulada', color: '#C47F12' },
  sabotaje: { texto: 'Sabotaje', color: '#D93025' },
  sin_conexion: { texto: 'Sin conexión', color: '#6B7280' },
  falla: { texto: 'Falla', color: '#C47F12' },
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
    <div className="min-h-screen flex flex-col" style={{ background: '#F2F4F7', color: '#15212E' }}>
      <header className="px-4 py-3 flex items-center gap-3" style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8EF' }}>
        <button onClick={alVolver} aria-label="Volver" className="text-2xl leading-none px-1" style={{ color: '#1E6EF0' }}>
          ‹
        </button>
        <div className="min-w-0">
          <h1 className="font-semibold text-base truncate">{panel.sitioNombre}</h1>
          <p className="text-xs truncate" style={{ color: '#6B7280' }}>
            Hikvision {panel.numeroCuenta}
            {panel.ultimaSenalEn && ` · en línea`}
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto p-4 flex flex-col gap-4 pb-24">
        {/* Estado grande */}
        <section className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center" style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)' }}>
          <div
            className="w-40 h-40 rounded-full flex flex-col items-center justify-center"
            style={{ background: enAlarma ? '#FDECEA' : m.fondo, border: `6px solid ${enAlarma ? '#D93025' : m.color}` }}
          >
            <span className="text-4xl" aria-hidden>
              {enAlarma ? '🚨' : modo === 'desarmado' ? '🔓' : modo === 'armado_casa' ? '🏠' : '🔒'}
            </span>
            <span className="font-semibold mt-1" style={{ color: enAlarma ? '#D93025' : m.color }}>
              {enAlarma ? 'EN ALARMA' : m.titulo}
            </span>
          </div>
          <p className="text-sm" style={{ color: '#6B7280' }}>
            {isLoading ? 'Consultando el panel…' : error ? 'No se pudo consultar el panel ahora.' : enAlarma ? 'Hay una alarma activa en el sistema.' : m.frase}
          </p>
          {particion?.nombre && estado!.particiones.filter((p) => p.habilitada).length > 1 && (
            <p className="text-xs" style={{ color: '#6B7280' }}>Partición {particion.nombre}</p>
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
                  background: activo ? MODO[a.modo].color : '#FFFFFF',
                  color: activo ? '#FFFFFF' : '#15212E',
                  boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)',
                  border: `1px solid ${activo ? MODO[a.modo].color : '#E3E8EF'}`,
                }}
              >
                <span className="text-2xl" aria-hidden>
                  {a.icono}
                </span>
                {a.titulo}
              </button>
            );
          })}
        </section>
        {confirmarDesarme && (
          <div className="rounded-xl p-3 flex items-center gap-3 text-sm" style={{ background: '#FDF2DF', border: '1px solid #C47F12' }}>
            <span className="flex-1">¿Desarmar el sistema? El sitio queda sin protección.</span>
            <button onClick={() => setConfirmarDesarme(false)} className="px-3 py-1.5 rounded-lg" style={{ color: '#6B7280' }}>
              No
            </button>
            <button onClick={() => pedir('desarmar')} className="px-3 py-1.5 rounded-lg font-semibold text-white" style={{ background: '#C47F12' }}>
              Sí, desarmar
            </button>
          </div>
        )}
        {aviso && (
          <p className="text-sm text-center" style={{ color: '#1E6EF0' }}>
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
          <section className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)' }}>
            <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold" style={{ color: '#6B7280' }}>
              Zonas
            </h2>
            <ul>
              {estado.zonas.map((z) => {
                const e = ZONA[z.estado];
                return (
                  <li key={z.numero} className="px-4 py-2.5 flex items-center gap-3" style={{ borderTop: '1px solid #EEF1F5' }}>
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: '#F1F3F6' }} aria-hidden>
                      {z.tipo === 'Fire' ? '🔥' : z.tipo === 'Delay' ? '🚪' : '👁'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{z.nombre}</span>
                      <span className="block text-xs truncate" style={{ color: '#6B7280' }}>
                        {z.descripcion ?? (z.tipo ? (TIPO_ZONA[z.tipo] ?? z.tipo) : '')}
                        {z.armada && ' · armada'}
                      </span>
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: e.color, background: `${e.color}1A` }}>
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
          <section className="rounded-2xl p-4 text-sm" style={{ background: '#FDF2DF', border: '1px solid #C47F12' }}>
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
        <section className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)' }}>
          <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold" style={{ color: '#6B7280' }}>
            Actividad reciente
          </h2>
          <ul>
            {(eventos ?? []).slice(0, 20).map((ev) => (
              <li key={ev.id} className="px-4 py-2.5 flex items-start gap-3 text-sm" style={{ borderTop: '1px solid #EEF1F5' }}>
                <span className="text-xs whitespace-nowrap pt-0.5 tabular-nums" style={{ color: '#6B7280' }}>
                  {new Date(ev.ocurridoEn).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ color: ev.categoria === 'alarma' ? '#D93025' : '#15212E' }}>
                    {ev.descripcion}
                  </span>
                  {ev.zona && (
                    <span className="block text-xs" style={{ color: '#6B7280' }}>
                      zona {ev.zona}
                      {ev.zonaDescripcion && ` · ${ev.zonaDescripcion}`}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {(eventos ?? []).length === 0 && (
              <li className="px-4 py-3 text-sm" style={{ color: '#6B7280' }}>
                Sin actividad registrada todavía.
              </li>
            )}
          </ul>
        </section>

        {/* Órdenes enviadas desde la app */}
        {(comandos ?? []).length > 0 && (
          <section className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)' }}>
            <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold" style={{ color: '#6B7280' }}>
              Órdenes enviadas
            </h2>
            <ul>
              {comandos!.slice(0, 5).map((c) => (
                <li key={c.id} className="px-4 py-2 flex items-center gap-3 text-sm" style={{ borderTop: '1px solid #EEF1F5' }}>
                  <span className="text-xs tabular-nums" style={{ color: '#6B7280' }}>
                    {new Date(c.creadoEn).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="flex-1">{c.accion === 'armar' ? 'Armar (ausente)' : c.accion === 'armar_casa' ? 'Armar en casa' : 'Desarmar'}</span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: c.estado === 'confirmado' ? '#0F8A6B' : c.estado === 'fallido' ? '#D93025' : '#C47F12' }}
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
    <div className="rounded-2xl px-3 py-2.5 text-center" style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)' }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: '#6B7280' }}>
        {titulo}
      </p>
      <p className="text-sm font-semibold" style={{ color: bien ? '#15212E' : '#D93025' }}>
        {valor}
      </p>
    </div>
  );
}
