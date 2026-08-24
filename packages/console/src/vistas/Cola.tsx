import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { anotarAlarma, cerrarAlarma, listarAcciones, listarAlarmas, tomarAlarma } from '../api.js';
import type { Alarma } from '../tipos.js';
import { fechaHora, transcurrido } from '../tiempo.js';
import { clasesPrioridad } from '../ui.js';

const ORDEN_ESTADO = { nueva: 0, en_atencion: 1, cerrada: 2 } as const;

export function Cola({ alarmaReciente }: { alarmaReciente: number | null }) {
  const { data: alarmas, isLoading } = useQuery({ queryKey: ['alarmas'], queryFn: listarAlarmas, refetchInterval: 15_000 });
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(temporizador);
  }, []);

  // Las nuevas arriba; dentro de cada estado, mayor prioridad y más tiempo esperando primero.
  const ordenadas = useMemo(
    () =>
      [...(alarmas ?? [])].sort(
        (a, b) =>
          ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
          a.prioridad - b.prioridad ||
          new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
      ),
    [alarmas],
  );

  const detalle = ordenadas.find((a) => a.id === seleccionada) ?? null;

  if (isLoading) return <p className="text-tenue">Cargando la cola…</p>;

  if (ordenadas.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
        <span className="led led-verde" aria-hidden />
        <p className="text-lg">Sin alarmas abiertas</p>
        <p className="text-tenue text-sm">El receptor sigue escuchando. Las alarmas nuevas aparecen acá al instante.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-5 h-full min-h-0">
      <ul className="flex-1 flex flex-col gap-2.5 min-w-0">
        {ordenadas.map((alarma) => (
          <TarjetaAlarma
            key={alarma.id}
            alarma={alarma}
            ahora={ahora}
            reciente={alarma.id === alarmaReciente}
            seleccionada={alarma.id === seleccionada}
            alSeleccionar={() => setSeleccionada(alarma.id === seleccionada ? null : alarma.id)}
          />
        ))}
      </ul>
      {detalle && <DetalleAlarma alarma={detalle} alCerrarPanel={() => setSeleccionada(null)} />}
    </div>
  );
}

function TarjetaAlarma({
  alarma,
  ahora,
  reciente,
  seleccionada,
  alSeleccionar,
}: {
  alarma: Alarma;
  ahora: number;
  reciente: boolean;
  seleccionada: boolean;
  alSeleccionar: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const prio = clasesPrioridad(alarma.prioridad);
  const tomar = useMutation({
    mutationFn: () => tomarAlarma(alarma.id),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] }),
  });

  return (
    <li
      className={`flex items-stretch bg-superficie border rounded-md overflow-hidden cursor-pointer ${
        seleccionada ? 'border-tenue' : 'border-borde'
      } ${reciente ? 'alarma-nueva' : ''}`}
      onClick={alSeleccionar}
    >
      <span className={`w-1.5 shrink-0 ${prio.barra}`} aria-hidden />
      <div className="flex-1 px-4 py-3 min-w-0">
        <div className="flex items-center gap-3">
          <span className={`font-datos font-semibold ${prio.texto}`}>{alarma.evento.codigo}</span>
          <span className="font-semibold truncate">{alarma.evento.descripcion}</span>
        </div>
        <div className="mt-1 font-datos text-xs text-tenue flex flex-wrap gap-x-4">
          <span>cuenta {alarma.evento.numeroCuenta ?? '—'}</span>
          {alarma.evento.zona && <span>zona {alarma.evento.zona}</span>}
          {alarma.evento.particion && <span>part {alarma.evento.particion}</span>}
          <span>{fechaHora(alarma.evento.ocurridoEn)}</span>
        </div>
      </div>
      <div className="px-4 py-3 flex flex-col items-end justify-between gap-2 shrink-0">
        <span className={`font-datos text-xs ${alarma.estado === 'nueva' ? prio.texto : 'text-tenue'}`}>
          {alarma.estado === 'nueva' ? `sin atender · ${transcurrido(alarma.creadoEn, ahora)}` : 'en atención'}
        </span>
        {alarma.estado === 'nueva' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              tomar.mutate();
            }}
            disabled={tomar.isPending}
            className="bg-superficie-2 hover:bg-borde border border-borde rounded px-3 py-1 text-sm font-semibold disabled:opacity-50"
          >
            Tomar
          </button>
        )}
      </div>
    </li>
  );
}

function DetalleAlarma({ alarma, alCerrarPanel }: { alarma: Alarma; alCerrarPanel: () => void }) {
  const clienteConsultas = useQueryClient();
  const { data: acciones } = useQuery({
    queryKey: ['acciones', alarma.id],
    queryFn: () => listarAcciones(alarma.id),
  });
  const [nota, setNota] = useState('');
  const [resolucion, setResolucion] = useState('');

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
  }

  const anotar = useMutation({
    mutationFn: () => anotarAlarma(alarma.id, nota),
    onSuccess: () => {
      setNota('');
      refrescar();
    },
  });
  const cerrar = useMutation({
    mutationFn: () => cerrarAlarma(alarma.id, resolucion),
    onSuccess: () => {
      refrescar();
      alCerrarPanel();
    },
  });

  const NOMBRE_ACCION = { toma: 'Tomada', nota: 'Nota', cierre: 'Cerrada', sistema: 'Sistema' } as const;

  return (
    <aside className="w-96 shrink-0 bg-superficie border border-borde rounded-md p-4 flex flex-col gap-4 self-start sticky top-0">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className={`font-datos font-semibold ${clasesPrioridad(alarma.prioridad).texto}`}>{alarma.evento.codigo}</p>
          <p className="font-semibold">{alarma.evento.descripcion}</p>
          <p className="font-datos text-xs text-tenue mt-1">
            cuenta {alarma.evento.numeroCuenta ?? '—'} · {fechaHora(alarma.evento.ocurridoEn)}
          </p>
        </div>
        <button onClick={alCerrarPanel} className="text-tenue hover:text-texto text-sm" aria-label="Cerrar panel">
          ✕
        </button>
      </header>

      <section className="flex-1 min-h-0">
        <h2 className="text-tenue text-xs uppercase tracking-wider mb-2">Historial</h2>
        <ul className="flex flex-col gap-2 text-sm max-h-64 overflow-y-auto">
          {(acciones ?? []).map((accion) => (
            <li key={accion.id} className="border-l-2 border-borde pl-3">
              <span className="font-datos text-xs text-tenue">{fechaHora(accion.creadoEn)}</span>{' '}
              <span className="font-semibold">{NOMBRE_ACCION[accion.tipo]}</span>
              {accion.detalle && <p className="text-tenue">{accion.detalle}</p>}
            </li>
          ))}
          {(acciones ?? []).length === 0 && <li className="text-tenue">Sin acciones todavía.</li>}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Anotar una gestión (llamada, verificación…)"
          rows={2}
          className="bg-fondo border border-borde rounded px-3 py-2 text-sm resize-none"
        />
        <button
          onClick={() => anotar.mutate()}
          disabled={!nota.trim() || anotar.isPending}
          className="self-end bg-superficie-2 hover:bg-borde border border-borde rounded px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Agregar nota
        </button>
      </section>

      <section className="flex flex-col gap-2 border-t border-borde pt-3">
        <textarea
          value={resolucion}
          onChange={(e) => setResolucion(e.target.value)}
          placeholder="Resolución (obligatoria para cerrar)"
          rows={2}
          className="bg-fondo border border-borde rounded px-3 py-2 text-sm resize-none"
        />
        <button
          onClick={() => cerrar.mutate()}
          disabled={!resolucion.trim() || cerrar.isPending}
          className="self-end bg-prio1/15 hover:bg-prio1/25 border border-prio1 text-prio1 rounded px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
        >
          Cerrar alarma
        </button>
      </section>
    </aside>
  );
}
