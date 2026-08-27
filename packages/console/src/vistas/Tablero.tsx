import { useQuery } from '@tanstack/react-query';
import { verTablero } from '../api.js';
import { fechaHora } from '../tiempo.js';
import { NOMBRE_CATEGORIA } from '../ui.js';
import { clasesPrioridad } from '../ui.js';
import type { FiltroCola } from './Cola.js';

/**
 * Tablero del administrador: el estado de la central de un vistazo.
 * Cada ficha lleva a la vista donde se actúa sobre ese número.
 */
export function Tablero({
  alIrACola,
  alIrAPaneles,
  alIrASenales,
}: {
  alIrACola: (filtro: FiltroCola) => void;
  alIrAPaneles: () => void;
  alIrASenales: () => void;
}) {
  const { data: tablero, isLoading } = useQuery({ queryKey: ['tablero'], queryFn: verTablero, refetchInterval: 30_000 });

  if (isLoading || !tablero) return <p className="text-tenue">Cargando el dashboard…</p>;

  const maximoCategoria = Math.max(1, ...tablero.eventosHoyPorCategoria.map((c) => c.cantidad));

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      {/* Fichas de estado: el número solo toma color cuando exige atención */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Ficha
          nombre="Alarmas nuevas"
          valor={tablero.alarmas.nuevas}
          alerta={tablero.alarmas.nuevas > 0}
          alClickear={() => alIrACola('nueva')}
        />
        <Ficha nombre="En atención" valor={tablero.alarmas.enAtencion} alClickear={() => alIrACola('en_atencion')} />
        <Ficha
          nombre="Dispositivos silenciosos"
          valor={tablero.paneles.silenciosos}
          alerta={tablero.paneles.silenciosos > 0}
          alClickear={alIrAPaneles}
        />
        <Ficha nombre="Señales hoy" valor={tablero.hoy.senales} alClickear={alIrASenales} />
        <Ficha nombre="Cerradas hoy" valor={tablero.alarmas.cerradasHoy} alClickear={() => alIrACola('cerrada')} />
        <Ficha nombre="Dispositivos activos" valor={tablero.paneles.activos} alClickear={alIrAPaneles} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Magnitud del día por categoría: una sola tinta, barras finas */}
        <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-2.5">
          <h2 className="text-tenue text-xs uppercase tracking-wider">Actividad de hoy ({tablero.hoy.eventos} eventos)</h2>
          {tablero.eventosHoyPorCategoria.length === 0 && <p className="text-tenue text-sm">Sin eventos todavía.</p>}
          {tablero.eventosHoyPorCategoria.map((c) => (
            <div key={c.categoria} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="text-tenue truncate">{NOMBRE_CATEGORIA[c.categoria]}</span>
              <div className="h-2 rounded-sm bg-superficie-2 overflow-hidden">
                <div
                  className="h-full rounded-sm bg-acento"
                  style={{ width: `${Math.max(3, (c.cantidad / maximoCategoria) * 100)}%` }}
                />
              </div>
              <span className="font-datos text-right">{c.cantidad}</span>
            </div>
          ))}
        </section>

        {/* Últimas alarmas: el pulso reciente, con salto directo a la cola */}
        <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-1.5">
          <h2 className="text-tenue text-xs uppercase tracking-wider mb-1">Últimas alarmas</h2>
          {tablero.ultimasAlarmas.length === 0 && <p className="text-tenue text-sm">Sin alarmas registradas.</p>}
          {tablero.ultimasAlarmas.map((a) => {
            const prio = clasesPrioridad(a.prioridad);
            return (
              <button
                key={a.id}
                onClick={() => alIrACola(a.estado === 'cerrada' ? 'cerrada' : 'abiertas')}
                className="flex items-center gap-2.5 text-left text-sm hover:bg-superficie-2/60 rounded-sm px-1.5 py-1"
              >
                <span className={`w-1 self-stretch rounded-sm ${prio.barra}`} aria-hidden />
                <span className={`font-datos font-semibold ${prio.texto}`}>{a.codigo}</span>
                <span className="flex-1 truncate">{a.descripcion}</span>
                <span className="font-datos text-xs text-tenue whitespace-nowrap">
                  {a.numeroCuenta ?? '—'}
                  {a.clienteNombre && ` ${a.clienteNombre}`}
                </span>
                <span className="font-datos text-xs text-tenue whitespace-nowrap">{fechaHora(a.creadoEn)}</span>
                <span className={`text-xs ${a.estado === 'nueva' ? prio.texto : a.estado === 'cerrada' ? 'text-tenue' : 'text-acento'}`}>
                  {a.estado === 'nueva' ? 'NUEVA' : a.estado === 'cerrada' ? 'CERRADA' : 'EN ATENCIÓN'}
                </span>
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function Ficha({
  nombre,
  valor,
  alerta = false,
  alClickear,
}: {
  nombre: string;
  valor: number;
  alerta?: boolean;
  alClickear: () => void;
}) {
  return (
    <button
      onClick={alClickear}
      className={`bg-superficie border rounded-sm p-3 text-center hover:border-acento transition-colors ${
        alerta ? 'border-prio1' : 'border-borde'
      }`}
    >
      <p className={`font-datos text-3xl tabular-nums ${alerta ? 'text-prio1' : ''}`}>{valor}</p>
      <p className="text-tenue text-xs uppercase tracking-wider mt-1">{nombre}</p>
    </button>
  );
}
