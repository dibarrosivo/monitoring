import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  anotarAlarma,
  cerrarAlarma,
  listarAcciones,
  listarAlarmas,
  tomarAlarma,
  verContexto,
} from '../api.js';
import type { Alarma } from '../tipos.js';
import { fechaHora, transcurrido } from '../tiempo.js';
import { clasesPrioridad } from '../ui.js';

const ORDEN_ESTADO = { nueva: 0, en_atencion: 1, cerrada: 2 } as const;
const NOMBRE_ESTADO = { nueva: 'NUEVA', en_atencion: 'EN ATENCIÓN', cerrada: 'CERRADA' } as const;

/**
 * Cola estilo central de comando (SIS): grilla densa de alarmas pendientes arriba,
 * panel de detalle fijo abajo con cuenta, lista de llamadas, historial y gestión.
 * El operador nunca navega a otra pantalla para procesar una alarma.
 */
export function Cola({ alarmaReciente }: { alarmaReciente: number | null }) {
  const { data: alarmas, isLoading } = useQuery({ queryKey: ['alarmas'], queryFn: listarAlarmas, refetchInterval: 15_000 });
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(temporizador);
  }, []);

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

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="flex-1 min-h-0 bg-superficie border border-borde rounded-sm overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-superficie-2 z-10">
            <tr className="text-left text-tenue text-xs uppercase tracking-wider">
              <th className="w-1 p-0" aria-label="Prioridad" />
              <th className="px-3 py-2 font-medium">Hora</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 font-medium">Cuenta</th>
              <th className="px-3 py-2 font-medium">Zona</th>
              <th className="px-3 py-2 font-medium">Part</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium text-right">Espera</th>
              <th className="px-3 py-2" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody className="font-datos">
            {ordenadas.map((alarma) => (
              <FilaAlarma
                key={alarma.id}
                alarma={alarma}
                ahora={ahora}
                reciente={alarma.id === alarmaReciente}
                seleccionada={alarma.id === seleccionada}
                alSeleccionar={() => setSeleccionada(alarma.id === seleccionada ? null : alarma.id)}
              />
            ))}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-tenue font-ui">
                  Sin alarmas abiertas. El receptor sigue escuchando; las nuevas aparecen acá al instante.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && <PanelDetalle alarma={detalle} alCerrarPanel={() => setSeleccionada(null)} />}
    </div>
  );
}

function FilaAlarma({
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
    <tr
      onClick={alSeleccionar}
      className={`cursor-pointer border-b border-borde/40 ${
        seleccionada ? 'bg-acento/10' : 'hover:bg-superficie-2/60'
      } ${reciente ? 'alarma-nueva' : ''}`}
    >
      <td className={`p-0 ${prio.barra}`} aria-hidden />
      <td className="px-3 py-1.5 text-tenue whitespace-nowrap">{fechaHora(alarma.evento.ocurridoEn)}</td>
      <td className={`px-3 py-1.5 font-semibold ${prio.texto}`}>{alarma.evento.codigo}</td>
      <td className="px-3 py-1.5 font-ui">{alarma.evento.descripcion}</td>
      <td className="px-3 py-1.5">{alarma.evento.numeroCuenta ?? '—'}</td>
      <td className="px-3 py-1.5 text-tenue">{alarma.evento.zona ?? '—'}</td>
      <td className="px-3 py-1.5 text-tenue">{alarma.evento.particion ?? '—'}</td>
      <td className={`px-3 py-1.5 text-xs ${alarma.estado === 'nueva' ? prio.texto : 'text-acento'}`}>
        {NOMBRE_ESTADO[alarma.estado]}
      </td>
      <td className={`px-3 py-1.5 text-right whitespace-nowrap ${alarma.estado === 'nueva' ? prio.texto : 'text-tenue'}`}>
        {transcurrido(alarma.creadoEn, ahora)}
      </td>
      <td className="px-3 py-1.5 text-right">
        {alarma.estado === 'nueva' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              tomar.mutate();
            }}
            disabled={tomar.isPending}
            className="bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-2.5 py-0.5 text-xs font-ui font-semibold disabled:opacity-50"
          >
            Tomar
          </button>
        )}
      </td>
    </tr>
  );
}

function PanelDetalle({ alarma, alCerrarPanel }: { alarma: Alarma; alCerrarPanel: () => void }) {
  const clienteConsultas = useQueryClient();
  const { data: acciones } = useQuery({
    queryKey: ['acciones', alarma.id],
    queryFn: () => listarAcciones(alarma.id),
  });
  const { data: contexto } = useQuery({
    queryKey: ['contexto', alarma.id],
    queryFn: () => verContexto(alarma.id),
  });
  const [nota, setNota] = useState('');
  const [resolucion, setResolucion] = useState('');

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
  }

  const tomar = useMutation({ mutationFn: () => tomarAlarma(alarma.id), onSuccess: refrescar });
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
  const prio = clasesPrioridad(alarma.prioridad);

  return (
    <section className="h-80 shrink-0 bg-superficie border border-borde rounded-sm flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-borde bg-superficie-2">
        <span className={`font-datos font-semibold ${prio.texto}`}>{alarma.evento.codigo}</span>
        <span className="font-semibold">{alarma.evento.descripcion}</span>
        <span className="font-datos text-xs text-tenue">
          {fechaHora(alarma.evento.ocurridoEn)} · {NOMBRE_ESTADO[alarma.estado]}
        </span>
        {alarma.estado === 'nueva' && (
          <button
            onClick={() => tomar.mutate()}
            disabled={tomar.isPending}
            className="ml-2 bg-acento/15 hover:bg-acento/25 border border-acento text-acento rounded-sm px-3 py-0.5 text-xs font-semibold disabled:opacity-50"
          >
            Tomar
          </button>
        )}
        <button onClick={alCerrarPanel} className="ml-auto text-tenue hover:text-texto" aria-label="Cerrar panel">
          ✕
        </button>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-3 divide-x divide-borde">
        {/* Cuenta y lista de llamadas */}
        <div className="p-3 overflow-y-auto text-sm flex flex-col gap-2">
          <h3 className="text-tenue text-xs uppercase tracking-wider">Cuenta</h3>
          {contexto?.cliente ? (
            <>
              <div>
                <p className="font-semibold">{contexto.cliente.nombre}</p>
                <p className="text-tenue">
                  {contexto.sitio?.nombre}
                  {contexto.sitio?.direccion && ` · ${contexto.sitio.direccion}`}
                </p>
                <p className="font-datos text-xs text-tenue mt-1">
                  cuenta {contexto.panel?.numeroCuenta} · {contexto.panel?.tipo}
                  {contexto.panel?.modelo && ` ${contexto.panel.modelo}`}
                </p>
                {contexto.zonaDescripcion && (
                  <p className="mt-1">
                    <span className="text-tenue">Zona {alarma.evento.zona}:</span>{' '}
                    <span className="font-semibold">{contexto.zonaDescripcion}</span>
                  </p>
                )}
              </div>
              <h3 className="text-tenue text-xs uppercase tracking-wider mt-1">Lista de llamadas</h3>
              <ol className="flex flex-col gap-1">
                {contexto.contactos.map((c) => (
                  <li key={c.id}>
                    <span className="font-datos text-tenue">{c.orden}.</span>{' '}
                    <span className="font-semibold">{c.nombre}</span>{' '}
                    <span className="font-datos text-acento">{c.telefono}</span>
                    {c.palabraClave && <span className="text-tenue"> · clave: {c.palabraClave}</span>}
                  </li>
                ))}
                {contexto.contactos.length === 0 && <li className="text-tenue">Sin contactos cargados.</li>}
              </ol>
            </>
          ) : (
            <p className="text-prio2">
              Cuenta {alarma.evento.numeroCuenta ?? 'desconocida'} sin cliente asociado. Darla de alta en Clientes.
            </p>
          )}
        </div>

        {/* Historial */}
        <div className="p-3 overflow-y-auto text-sm">
          <h3 className="text-tenue text-xs uppercase tracking-wider mb-2">Historial</h3>
          <ul className="flex flex-col gap-1.5">
            {(acciones ?? []).map((accion) => (
              <li key={accion.id} className="border-l-2 border-borde pl-2.5">
                <span className="font-datos text-xs text-tenue">{fechaHora(accion.creadoEn)}</span>{' '}
                <span className="font-semibold">{NOMBRE_ACCION[accion.tipo]}</span>
                {accion.detalle && <p className="text-tenue">{accion.detalle}</p>}
              </li>
            ))}
            {(acciones ?? []).length === 0 && <li className="text-tenue">Sin acciones todavía.</li>}
          </ul>
        </div>

        {/* Gestión */}
        <div className="p-3 flex flex-col gap-2 text-sm">
          <h3 className="text-tenue text-xs uppercase tracking-wider">Gestión</h3>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Anotar una gestión (llamada, verificación…)"
            rows={2}
            className="bg-fondo border border-borde rounded-sm px-2.5 py-1.5 resize-none"
          />
          <button
            onClick={() => anotar.mutate()}
            disabled={!nota.trim() || anotar.isPending}
            className="self-end bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1 text-xs font-semibold disabled:opacity-50"
          >
            Agregar nota
          </button>
          <textarea
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value)}
            placeholder="Resolución (obligatoria para cerrar)"
            rows={2}
            className="bg-fondo border border-borde rounded-sm px-2.5 py-1.5 resize-none mt-auto"
          />
          <button
            onClick={() => cerrar.mutate()}
            disabled={!resolucion.trim() || cerrar.isPending}
            className="self-end bg-prio1/15 hover:bg-prio1/25 border border-prio1 text-prio1 rounded-sm px-3 py-1 text-xs font-semibold disabled:opacity-40"
          >
            Cerrar alarma
          </button>
        </div>
      </div>
    </section>
  );
}
