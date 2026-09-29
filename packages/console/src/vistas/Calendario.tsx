import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crearFeriado, eliminarFeriado, listarFeriados } from '../api.js';
import { feriadosVenezuela } from '../feriados.js';

import { BOTON, CAMPO } from '../estilos.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function diaSemana(fechaIso: string): string {
  return DIAS[new Date(`${fechaIso}T12:00:00`).getDay()]!;
}

/**
 * Calendario de feriados de la central. En un feriado el vigilante no
 * supervisa aperturas ni cierres: un comercio cerrado ese día no dispara
 * "no abrió a horario". Los nacionales se cargan de un clic por año; los
 * regionales y bancarios se agregan a mano.
 */
export function Calendario() {
  const clienteConsultas = useQueryClient();
  const { data: feriados, isLoading } = useQuery({ queryKey: ['feriados'], queryFn: listarFeriados });
  const hoy = new Date().toISOString().slice(0, 10);
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['feriados'] });
  const crear = useMutation({
    mutationFn: () => crearFeriado({ fecha, descripcion: descripcion || undefined }),
    onSuccess: () => {
      setFecha('');
      setDescripcion('');
      setError(null);
      refrescar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo agregar'),
  });
  const borrar = useMutation({ mutationFn: eliminarFeriado, onSuccess: refrescar });

  const delAnio = useMemo(() => (feriados ?? []).filter((f) => f.fecha.startsWith(String(anio))), [feriados, anio]);
  const cargadas = new Set(delAnio.map((f) => f.fecha));
  const faltantes = feriadosVenezuela(anio).filter((f) => !cargadas.has(f.fecha));
  const cargarNacionales = useMutation({
    mutationFn: async () => {
      for (const f of faltantes) await crearFeriado(f);
      return faltantes.length;
    },
    onSuccess: refrescar,
  });

  const porMes = useMemo(() => {
    const grupos = new Map<number, typeof delAnio>();
    for (const f of delAnio) {
      const mes = Number(f.fecha.slice(5, 7)) - 1;
      grupos.set(mes, [...(grupos.get(mes) ?? []), f]);
    }
    return [...grupos.entries()].sort((a, b) => a[0] - b[0]);
  }, [delAnio]);

  if (isLoading) return <p className="text-tenue">Cargando calendario…</p>;

  return (
    <div className="max-w-4xl flex flex-col gap-4">
      <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-tenue text-xs uppercase tracking-wider">Feriados</h2>
          <div className="flex items-center gap-1 font-datos">
            <button onClick={() => setAnio(anio - 1)} className="px-2 text-tenue hover:text-texto" aria-label="Año anterior">
              ‹
            </button>
            <span className="font-semibold text-lg">{anio}</span>
            <button onClick={() => setAnio(anio + 1)} className="px-2 text-tenue hover:text-texto" aria-label="Año siguiente">
              ›
            </button>
          </div>
          <span className="text-tenue text-xs font-datos">
            {delAnio.length} {delAnio.length === 1 ? 'día' : 'días'}
          </span>
          <span className="flex-1" />
          {faltantes.length > 0 && (
            <button onClick={() => cargarNacionales.mutate()} disabled={cargarNacionales.isPending} className={BOTON}>
              Cargar los {faltantes.length} feriados nacionales de {anio}
            </button>
          )}
        </div>
        <p className="text-tenue text-sm">
          En estos días no se supervisan aperturas ni cierres: un comercio cerrado por feriado no dispara "no abrió a horario". Las
          alarmas y las aperturas fuera de horario siguen igual.
        </p>
        {porMes.length === 0 && <p className="text-tenue text-sm">Sin feriados cargados para {anio}.</p>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {porMes.map(([mes, lista]) => (
            <div key={mes} className="border border-borde/60 rounded-sm p-3">
              <h3 className="text-xs uppercase tracking-wider text-tenue mb-1.5">{MESES[mes]}</h3>
              <ul className="text-sm flex flex-col gap-1">
                {lista.map((f) => (
                  <li key={f.id} className={`flex items-center gap-2 ${f.fecha < hoy ? 'text-tenue' : ''}`}>
                    <span className="font-datos w-7 text-right">{Number(f.fecha.slice(8, 10))}</span>
                    <span className="text-tenue text-xs w-16">{diaSemana(f.fecha)}</span>
                    <span className="flex-1 font-ui">{f.descripcion ?? 'Feriado'}</span>
                    <button onClick={() => borrar.mutate(f.id)} className="text-tenue hover:text-prio1" aria-label="Quitar feriado" title="Quitar">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
        className="bg-superficie border border-borde rounded-sm p-4 flex flex-wrap gap-2 items-center"
      >
        <span className="text-tenue text-xs uppercase tracking-wider w-full">Agregar un feriado regional o bancario</span>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={`${CAMPO} font-datos`} />
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción (Día de Coro, feriado bancario…)"
          className={`${CAMPO} w-80`}
        />
        <button type="submit" disabled={!fecha || crear.isPending} className={BOTON}>
          Agregar
        </button>
        {error && <span className="text-prio1 text-xs">{error}</span>}
      </form>
    </div>
  );
}
