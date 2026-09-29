import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activarPauta,
  crearGuardia,
  crearPauta,
  crearTramoTurno,
  eliminarGuardia,
  eliminarPauta,
  eliminarTramoTurno,
  listarUsuarios,
  verTurnos,
} from '../api.js';
import type { GuardiaVista, TramoTurnoVista } from '../tipos.js';
import { BOTON, BOTON_MINI, BOTON_MINI_ROJO, CAMPO } from '../estilos.js';

/**
 * Turnos de la central: quién está de guardia y a quién le suena el teléfono
 * cuando entra una emergencia.
 *
 * Dos formas, y la segunda manda: la pauta semanal (se pueden tener varias
 * para rotaciones, rige la activa) y las guardias por fecha, que reemplazan
 * a la pauta ese día.
 */

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const hoyIso = () => new Date().toISOString().slice(0, 10);
const hhmm = (h: string) => h.slice(0, 5);

export function Turnos() {
  const clienteConsultas = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['turnos'], queryFn: verTurnos, refetchInterval: 60_000 });
  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: () => listarUsuarios() });
  const personal = useMemo(() => (usuarios ?? []).filter((u) => u.rol !== 'cliente' && u.activo), [usuarios]);
  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['turnos'] });

  const nuevaPauta = useMutation({ mutationFn: crearPauta, onSuccess: refrescar });
  const activar = useMutation({ mutationFn: activarPauta, onSuccess: refrescar });
  const borrarPauta = useMutation({ mutationFn: eliminarPauta, onSuccess: refrescar });
  const borrarTramo = useMutation({ mutationFn: eliminarTramoTurno, onSuccess: refrescar });
  const borrarGuardia = useMutation({ mutationFn: eliminarGuardia, onSuccess: refrescar });

  if (isLoading || !data) return <p className="text-tenue">Cargando turnos…</p>;

  const vigente = data.pautas.find((p) => p.id === data.vigente) ?? null;
  const tramosVigentes = data.tramos.filter((t) => t.pautaId === vigente?.id);
  const deGuardia = personal.filter((u) => data.deGuardiaAhora.includes(u.id));
  const futuras = data.guardias.filter((g) => g.fecha >= hoyIso());

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <section className={`border rounded-sm p-4 ${deGuardia.length ? 'bg-ok/10 border-ok/40' : 'bg-prio2/10 border-prio2/40'}`}>
        <h2 className="text-tenue text-xs uppercase tracking-wider">De guardia ahora</h2>
        {deGuardia.length > 0 ? (
          <p className="text-lg font-semibold">{deGuardia.map((u) => u.nombre).join(', ')}</p>
        ) : (
          <p className="text-lg font-semibold text-prio2">Nadie asignado</p>
        )}
        <p className="text-sm text-tenue mt-1">
          {deGuardia.length > 0
            ? 'Las emergencias le suenan al teléfono de esa persona.'
            : 'Sin nadie de guardia, las emergencias le suenan a todo el personal.'}
        </p>
      </section>

      <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-tenue text-xs uppercase tracking-wider">Pauta semanal</h2>
          {data.pautas.length > 1 && <span className="text-xs text-tenue">rige la activa; con una sola, esa se usa siempre</span>}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {data.pautas.map((p) => (
            <span key={p.id} className={`inline-flex items-center gap-2 border rounded-sm px-3 py-1.5 text-sm ${p.id === data.vigente ? 'border-acento text-acento bg-acento/10' : 'border-borde'}`}>
              {p.nombre}
              {p.id === data.vigente ? (
                <span className="text-xs uppercase">vigente</span>
              ) : (
                <button onClick={() => activar.mutate(p.id)} className={BOTON_MINI}>
                  activar
                </button>
              )}
              {data.pautas.length > 1 && (
                <button onClick={() => confirm(`¿Borrar la pauta "${p.nombre}" y sus turnos?`) && borrarPauta.mutate(p.id)} className={BOTON_MINI_ROJO}>
                  borrar
                </button>
              )}
            </span>
          ))}
          <NuevaPauta alCrear={(n) => nuevaPauta.mutate(n)} />
        </div>

        {!vigente && data.pautas.length > 1 && <p className="text-prio2 text-sm">Ninguna pauta está activa: hoy no hay turnos en vigor.</p>}

        {vigente && (
          <>
            {tramosVigentes.length === 0 && <p className="text-tenue text-sm">La pauta «{vigente.nombre}» todavía no tiene turnos cargados.</p>}
            {tramosVigentes.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-tenue text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-2 py-1 font-normal">Quién</th>
                    <th className="text-left px-2 py-1 font-normal">Días</th>
                    <th className="text-left px-2 py-1 font-normal">Desde</th>
                    <th className="text-left px-2 py-1 font-normal">Hasta</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tramosVigentes.map((t) => (
                    <FilaTramo key={t.id} tramo={t} alBorrar={() => borrarTramo.mutate(t.id)} />
                  ))}
                </tbody>
              </table>
            )}
            <NuevoTramo pautaId={vigente.id} personal={personal} alGuardar={refrescar} />
          </>
        )}
      </section>

      <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
        <h2 className="text-tenue text-xs uppercase tracking-wider">Guardias por fecha</h2>
        <p className="text-sm text-tenue">
          La excepción: vacaciones, un cambio entre operadores, un feriado. Si un día tiene guardias cargadas, esas reemplazan a la pauta ese día.
        </p>
        {futuras.length === 0 && <p className="text-tenue text-sm">Sin guardias cargadas.</p>}
        {futuras.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {futuras.map((g) => (
              <FilaGuardia key={g.id} guardia={g} alBorrar={() => borrarGuardia.mutate(g.id)} />
            ))}
          </ul>
        )}
        <NuevaGuardia personal={personal} alGuardar={refrescar} />
      </section>
    </div>
  );
}

function FilaTramo({ tramo: t, alBorrar }: { tramo: TramoTurnoVista; alBorrar: () => void }) {
  const dias = [...t.dias].map((d, i) => (d === '-' ? null : NOMBRE_DIA[i])).filter(Boolean);
  const nocturno = hhmm(t.hasta) <= hhmm(t.desde);
  return (
    <tr className="border-t border-borde/50">
      <td className="px-2 py-1 font-semibold">{t.usuarioNombre}</td>
      <td className="px-2 py-1">
        <span className="font-datos tracking-widest">{t.dias}</span>
        <span className="text-tenue text-xs ml-2">{dias.length === 7 ? 'todos los días' : dias.join(', ')}</span>
      </td>
      <td className="px-2 py-1 font-datos">{hhmm(t.desde)}</td>
      <td className="px-2 py-1 font-datos">
        {hhmm(t.hasta)}
        {nocturno && <span className="text-tenue text-xs ml-1">del día siguiente</span>}
      </td>
      <td className="px-2 py-1 text-right">
        <button onClick={() => confirm('¿Borrar este turno?') && alBorrar()} className={BOTON_MINI_ROJO}>
          borrar
        </button>
      </td>
    </tr>
  );
}

function FilaGuardia({ guardia: g, alBorrar }: { guardia: GuardiaVista; alBorrar: () => void }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3">
      <span className="font-datos text-xs">{g.fecha}</span>
      <span className="font-semibold">{g.usuarioNombre}</span>
      <span className="font-datos text-xs text-tenue">
        {hhmm(g.desde)} a {hhmm(g.hasta)}
      </span>
      {g.nota && <span className="text-xs text-tenue">{g.nota}</span>}
      <span className="flex-1" />
      <button onClick={() => confirm('¿Borrar esta guardia?') && alBorrar()} className={BOTON_MINI_ROJO}>
        borrar
      </button>
    </li>
  );
}

function NuevaPauta({ alCrear }: { alCrear: (nombre: string) => void }) {
  const [nombre, setNombre] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        alCrear(nombre.trim());
        setNombre('');
      }}
      className="flex gap-2 items-center"
    >
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nueva pauta (Semana B)" className={CAMPO} />
      <button type="submit" className={BOTON_MINI}>
        agregar
      </button>
    </form>
  );
}

/** Selector de días: siete letras que se encienden y se apagan. */
function SelectorDias({ dias, alCambiar }: { dias: string; alCambiar: (d: string) => void }) {
  return (
    <span className="inline-flex gap-1">
      {LETRAS.map((l, i) => {
        const activo = dias[i] !== '-';
        return (
          <button
            key={i}
            type="button"
            onClick={() => alCambiar(dias.slice(0, i) + (activo ? '-' : l) + dias.slice(i + 1))}
            className={`w-7 h-7 rounded-sm border text-xs font-semibold ${activo ? 'border-acento text-acento bg-acento/15' : 'border-borde text-tenue'}`}
            title={NOMBRE_DIA[i]}
          >
            {l}
          </button>
        );
      })}
    </span>
  );
}

function NuevoTramo({ pautaId, personal, alGuardar }: { pautaId: number; personal: { id: number; nombre: string }[]; alGuardar: () => void }) {
  const [d, setD] = useState({ usuarioId: '', dias: 'LMXJV--', desde: '07:00', hasta: '19:00' });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () => crearTramoTurno({ pautaId, usuarioId: Number(d.usuarioId), dias: d.dias, desde: d.desde, hasta: d.hasta }),
    onSuccess: () => {
      setD({ ...d, usuarioId: '' });
      alGuardar();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar'),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!d.usuarioId) return setError('Elija a quién le toca');
        if (d.dias === '-------') return setError('Elija al menos un día');
        guardar.mutate();
      }}
      className="flex flex-wrap gap-3 items-end border-t border-borde/50 pt-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Quién</span>
        <select value={d.usuarioId} onChange={(e) => setD({ ...d, usuarioId: e.target.value })} className={CAMPO}>
          <option value="">Elegir…</option>
          {personal.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Días</span>
        <SelectorDias dias={d.dias} alCambiar={(dias) => setD({ ...d, dias })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Desde</span>
        <input type="time" value={d.desde} onChange={(e) => setD({ ...d, desde: e.target.value })} className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Hasta</span>
        <input type="time" value={d.hasta} onChange={(e) => setD({ ...d, hasta: e.target.value })} className={CAMPO} />
      </label>
      <button type="submit" disabled={guardar.isPending} className={BOTON}>
        Agregar turno
      </button>
      {error && <p className="text-prio1 text-xs w-full">{error}</p>}
    </form>
  );
}

function NuevaGuardia({ personal, alGuardar }: { personal: { id: number; nombre: string }[]; alGuardar: () => void }) {
  const [d, setD] = useState({ usuarioId: '', fecha: hoyIso(), desde: '07:00', hasta: '19:00', nota: '' });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () => crearGuardia({ usuarioId: Number(d.usuarioId), fecha: d.fecha, desde: d.desde, hasta: d.hasta, nota: d.nota || null }),
    onSuccess: () => {
      setD({ ...d, usuarioId: '', nota: '' });
      alGuardar();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar'),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!d.usuarioId) return setError('Elija a quién le toca');
        guardar.mutate();
      }}
      className="flex flex-wrap gap-3 items-end border-t border-borde/50 pt-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Quién</span>
        <select value={d.usuarioId} onChange={(e) => setD({ ...d, usuarioId: e.target.value })} className={CAMPO}>
          <option value="">Elegir…</option>
          {personal.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Fecha</span>
        <input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Desde</span>
        <input type="time" value={d.desde} onChange={(e) => setD({ ...d, desde: e.target.value })} className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Hasta</span>
        <input type="time" value={d.hasta} onChange={(e) => setD({ ...d, hasta: e.target.value })} className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tenue">Nota</span>
        <input value={d.nota} onChange={(e) => setD({ ...d, nota: e.target.value })} className={CAMPO} placeholder="cambio con Daniel" />
      </label>
      <button type="submit" disabled={guardar.isPending} className={BOTON}>
        Agregar guardia
      </button>
      {error && <p className="text-prio1 text-xs w-full">{error}</p>}
    </form>
  );
}
