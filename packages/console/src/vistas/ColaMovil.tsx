import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { anotarAlarma, cerrarAlarma, listarAlarmas, tomarAlarma, verContexto } from '../api.js';
import type { Alarma } from '../tipos.js';
import { transcurrido } from '../tiempo.js';
import { clasesPrioridad } from '../ui.js';

const ORDEN_ESTADO = { nueva: 0, en_atencion: 1, cerrada: 2 } as const;

/** La cola del operador en pantalla chica: tarjetas expandibles con todo el flujo. */
export function ColaMovil() {
  const { data: alarmas, isLoading } = useQuery({ queryKey: ['alarmas'], queryFn: () => listarAlarmas(), refetchInterval: 10_000 });
  const [abierta, setAbierta] = useState<number | null>(null);

  if (isLoading) return <p className="text-tenue">Cargando la cola…</p>;

  const ordenadas = [...(alarmas ?? [])].sort(
    (a, b) =>
      ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
      a.prioridad - b.prioridad ||
      new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
  );

  if (ordenadas.length === 0) {
    return <p className="text-tenue text-center mt-10">Sin alarmas abiertas. El receptor sigue escuchando.</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {ordenadas.map((alarma) => (
        <TarjetaAlarma
          key={alarma.id}
          alarma={alarma}
          abierta={abierta === alarma.id}
          alAbrir={() => setAbierta(abierta === alarma.id ? null : alarma.id)}
        />
      ))}
    </ul>
  );
}

function TarjetaAlarma({ alarma, abierta, alAbrir }: { alarma: Alarma; abierta: boolean; alAbrir: () => void }) {
  const prio = clasesPrioridad(alarma.prioridad);
  const fondo = alarma.estado === 'nueva' && alarma.prioridad <= 2 ? (alarma.prioridad <= 1 ? 'bg-prio1/15' : 'bg-prio2/10') : '';

  return (
    <li className={`bg-superficie border rounded-lg overflow-hidden ${prio.borde} ${fondo}`}>
      <button onClick={alAbrir} className="w-full text-left p-3 flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className={`font-datos font-semibold ${prio.texto}`}>{alarma.evento.codigo}</span>
          <span className="font-semibold text-sm flex-1 truncate">{alarma.evento.descripcion}</span>
        </span>
        <span className="font-datos text-xs text-tenue flex flex-wrap gap-x-3">
          <span>
            cuenta {alarma.evento.numeroCuenta ?? '—'}
            {alarma.clienteNombre && <span className="font-ui text-texto"> · {alarma.clienteNombre}</span>}
          </span>
          {alarma.evento.zona && (
            <span>
              zona {alarma.evento.zona}
              {alarma.zonaDescripcion && ` - ${alarma.zonaDescripcion}`}
            </span>
          )}
          <span className={alarma.estado === 'nueva' ? prio.texto : 'text-acento'}>
            {alarma.estado === 'nueva' ? `SIN ATENDER · ${transcurrido(alarma.creadoEn)}` : 'EN ATENCIÓN'}
          </span>
        </span>
      </button>
      {abierta && <DetalleMovil alarma={alarma} />}
    </li>
  );
}

function DetalleMovil({ alarma }: { alarma: Alarma }) {
  const clienteConsultas = useQueryClient();
  const { data: contexto } = useQuery({ queryKey: ['contexto', alarma.id], queryFn: () => verContexto(alarma.id) });
  const [nota, setNota] = useState('');
  const [resolucion, setResolucion] = useState('');

  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
  const tomar = useMutation({ mutationFn: () => tomarAlarma(alarma.id), onSuccess: refrescar });
  const anotar = useMutation({ mutationFn: () => anotarAlarma(alarma.id, nota), onSuccess: () => setNota('') });
  const cerrar = useMutation({ mutationFn: () => cerrarAlarma(alarma.id, resolucion), onSuccess: refrescar });

  return (
    <div className="border-t border-borde p-3 flex flex-col gap-3 text-sm">
      {contexto?.cliente ? (
        <div className="flex flex-col gap-1.5">
          {contexto.cliente.instrucciones && (
            <div className="bg-prio2/10 border border-prio2/40 rounded p-2">
              <p className="text-prio2 text-xs uppercase tracking-wider mb-0.5">Plan de acción</p>
              <p className="whitespace-pre-wrap">{contexto.cliente.instrucciones}</p>
            </div>
          )}
          <p className="font-semibold">{contexto.cliente.nombre}</p>
          <p className="text-tenue">
            {contexto.sitio?.nombre}
            {contexto.sitio?.direccion && ` · ${contexto.sitio.direccion}`}
          </p>
          {contexto.contactos.map((c) => (
            <p key={c.id}>
              <span className="font-datos text-tenue">{c.orden}.</span> {c.nombre}{' '}
              <a href={`tel:${c.telefono}`} className="font-datos text-acento underline underline-offset-2">
                {c.telefono}
              </a>
              {c.palabraClave && <span className="text-tenue"> · clave: {c.palabraClave}</span>}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-prio2">Cuenta sin cliente asociado.</p>
      )}

      {alarma.estado === 'nueva' && (
        <button
          onClick={() => tomar.mutate()}
          disabled={tomar.isPending}
          className="bg-acento/15 border border-acento text-acento rounded py-2.5 font-semibold disabled:opacity-50"
        >
          Tomar alarma
        </button>
      )}

      <div className="flex gap-2">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (llamada, verificación…)"
          className="flex-1 min-w-0 bg-fondo border border-borde rounded px-3 py-2"
        />
        <button
          onClick={() => anotar.mutate()}
          disabled={!nota.trim() || anotar.isPending}
          className="bg-superficie-2 border border-borde rounded px-3 disabled:opacity-50"
        >
          Anotar
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={resolucion}
          onChange={(e) => setResolucion(e.target.value)}
          placeholder="Resolución para cerrar"
          className="flex-1 min-w-0 bg-fondo border border-borde rounded px-3 py-2"
        />
        <button
          onClick={() => cerrar.mutate()}
          disabled={!resolucion.trim() || cerrar.isPending}
          className="bg-prio1/15 border border-prio1 text-prio1 rounded px-3 font-semibold disabled:opacity-40"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
