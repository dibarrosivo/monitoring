import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { anotarAlarma, devolverAlarma, listarAcciones, listarAlarmas, tomarAlarma, verContexto } from '../api.js';
import type { Alarma } from '../tipos.js';
import { transcurrido } from '../tiempo.js';
import { clasesPrioridad, nombreCuenta } from '../ui.js';
import { Bitacora, FormularioCierre, ListaLlamadas } from './GestionAlarma.js';

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
            cuenta {nombreCuenta(alarma.prefijo, alarma.evento.numeroCuenta)}
            {alarma.clienteNombre && <span className="font-ui text-texto"> · {alarma.clienteNombre}</span>}
          </span>
          {alarma.evento.zona && (
            <span>
              zona {alarma.evento.zona}
              {alarma.zonaDescripcion && ` - ${alarma.zonaDescripcion}`}
            </span>
          )}
          <span className={alarma.estado === 'nueva' ? prio.texto : 'text-acento'}>
            {alarma.estado === 'nueva'
              ? `SIN ATENDER · ${transcurrido(alarma.creadoEn)}`
              : `EN ATENCIÓN${alarma.operadorNombre ? ` · ${alarma.operadorNombre}` : ''}`}
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
  const { data: acciones } = useQuery({ queryKey: ['acciones', alarma.id], queryFn: () => listarAcciones(alarma.id) });
  const [nota, setNota] = useState('');

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
  }
  const tomar = useMutation({ mutationFn: () => tomarAlarma(alarma.id), onSuccess: refrescar, onError: refrescar });
  const devolver = useMutation({ mutationFn: () => devolverAlarma(alarma.id), onSuccess: refrescar });
  const anotar = useMutation({
    mutationFn: () => anotarAlarma(alarma.id, nota),
    onSuccess: () => {
      setNota('');
      refrescar();
    },
  });

  return (
    <div className="border-t border-borde p-3 flex flex-col gap-3 text-sm">
      {contexto?.cliente ? (
        <div className="flex flex-col gap-1.5">
          {(contexto.sitio?.instrucciones || contexto.cliente.instrucciones) && (
            <div className="bg-prio2/10 border border-prio2/40 rounded p-2">
              <p className="text-prio2 text-xs uppercase tracking-wider mb-0.5">Plan de acción</p>
              <p className="whitespace-pre-wrap">{contexto.sitio?.instrucciones ?? contexto.cliente.instrucciones}</p>
            </div>
          )}
          {contexto.cliente.estado !== 'activo' && (
            <p className="text-prio2 text-xs font-semibold uppercase">Cliente {contexto.cliente.estado}</p>
          )}
          <p className="font-semibold">{contexto.cliente.nombre}</p>
          <p className="text-tenue">
            {contexto.sitio?.nombre}
            {contexto.sitio?.direccion && ` · ${contexto.sitio.direccion}`}
          </p>
          {contexto.zonaDescripcion && (
            <p>
              <span className="text-tenue">Zona {alarma.evento.zona}:</span> <span className="font-semibold">{contexto.zonaDescripcion}</span>
            </p>
          )}
          <ListaLlamadas alarma={alarma} contactos={contexto.contactos} compacta />
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
      {tomar.isError && <p className="text-prio2 text-xs">{(tomar.error as Error).message}</p>}
      {alarma.estado === 'en_atencion' && (
        <button
          onClick={() => devolver.mutate()}
          disabled={devolver.isPending}
          className="text-tenue text-xs underline underline-offset-2 self-start disabled:opacity-50"
        >
          Devolver a la cola
        </button>
      )}

      <div className="flex gap-2">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (verificación, observación…)"
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

      <details className="text-sm">
        <summary className="text-tenue text-xs uppercase tracking-wider cursor-pointer">Historial</summary>
        <div className="mt-2">
          <Bitacora acciones={acciones} />
        </div>
      </details>

      <p className="text-tenue text-xs uppercase tracking-wider">Cierre</p>
      <FormularioCierre alarma={alarma} compacto />
    </div>
  );
}
