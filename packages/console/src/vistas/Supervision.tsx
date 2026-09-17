import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { verActividadOperador, verSupervision } from '../api.js';
import type { OperadorSupervision } from '../tipos.js';
import { duracionCorta, fechaHora, transcurrido } from '../tiempo.js';
import { nombreCuenta } from '../ui.js';
import { ETIQUETA_DESENLACE, MOTIVOS_CIERRE } from '../cierres.js';

/**
 * Supervisión del personal: qué hizo cada operador y cómo, en un período.
 * Arriba, lo que necesita atención ahora; después, una fila por persona con
 * sus números; y al elegir a alguien, su línea de tiempo completa.
 */

type Rango = 'hoy' | '7d' | '30d' | 'personalizado';

function limites(rango: Rango, desde: string, hasta: string): { desde: string; hasta: string } {
  const fin = new Date();
  if (rango === 'personalizado') return { desde: new Date(desde).toISOString(), hasta: new Date(`${hasta}T23:59:59`).toISOString() };
  const inicio = new Date(fin);
  if (rango === 'hoy') inicio.setHours(0, 0, 0, 0);
  else inicio.setDate(inicio.getDate() - (rango === '7d' ? 7 : 30));
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

function seg(s: number | null): string {
  return s === null ? '—' : duracionCorta(s * 1000);
}

export function Supervision() {
  const [rango, setRango] = useState<Rango>('7d');
  const hoyIso = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoyIso);
  const [hasta, setHasta] = useState(hoyIso);
  const [elegido, setElegido] = useState<number | null>(null);
  const l = limites(rango, desde, hasta);
  const { data, isLoading } = useQuery({
    queryKey: ['supervision', l.desde, l.hasta],
    queryFn: () => verSupervision(l.desde, l.hasta),
    refetchInterval: 60_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ['hoy', 'Hoy'],
            ['7d', 'Últimos 7 días'],
            ['30d', 'Últimos 30 días'],
            ['personalizado', 'Período'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setRango(valor)}
            className={`px-3 py-1 rounded-sm text-sm border ${
              rango === valor ? 'bg-superficie-2 border-borde font-semibold' : 'border-transparent text-tenue hover:text-texto'
            }`}
          >
            {etiqueta}
          </button>
        ))}
        {rango === 'personalizado' && (
          <span className="flex items-center gap-2 font-datos text-sm">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="bg-fondo border border-borde rounded-sm px-2 py-1" />
            <span className="text-tenue">a</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="bg-fondo border border-borde rounded-sm px-2 py-1" />
          </span>
        )}
      </div>

      {/* Lo que necesita atención ahora */}
      {data && data.alertas.length > 0 && (
        <section className="bg-prio2/10 border border-prio2/40 rounded-sm p-3">
          <h2 className="text-prio2 text-xs uppercase tracking-wider mb-1.5">Ahora mismo</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {data.alertas.map((a, i) => (
              <li key={i} className={a.tipo === 'sin_tomar' && (a.prioridad ?? 9) <= 1 ? 'text-prio1 font-semibold' : ''}>
                {a.texto}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLoading && <p className="text-tenue">Calculando…</p>}

      {data && (
        <div className="bg-superficie border border-borde rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tenue text-xs uppercase tracking-wider border-b border-borde">
                <th className="px-3 py-2 font-medium">Operador</th>
                <th className="px-3 py-2 font-medium text-right">Tomadas</th>
                <th className="px-3 py-2 font-medium text-right" title="Tiempo medio desde que la alarma entra hasta que la toma">Reacción</th>
                <th className="px-3 py-2 font-medium text-right" title="Peor tiempo de reacción del período">Máx.</th>
                <th className="px-3 py-2 font-medium text-right">Cerradas</th>
                <th className="px-3 py-2 font-medium text-right" title="Tiempo medio en atención hasta cerrar">Atención</th>
                <th className="px-3 py-2 font-medium">Desenlaces</th>
                <th className="px-3 py-2 font-medium text-right">Llamadas</th>
                <th className="px-3 py-2 font-medium text-right">Notas</th>
                <th className="px-3 py-2 font-medium text-right" title="Alarmas devueltas a la cola">Devueltas</th>
                <th className="px-3 py-2 font-medium text-right" title="Avisos del hombre muerto sin confirmar">H. muerto</th>
                <th className="px-3 py-2 font-medium text-right">Servicio</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="font-datos">
              {data.operadores.map((o) => (
                <FilaOperador key={o.id} operador={o} elegido={elegido === o.id} alElegir={() => setElegido(elegido === o.id ? null : o.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && elegido !== null && (
        <Actividad operadorId={elegido} desde={l.desde} hasta={l.hasta} alCerrar={() => setElegido(null)} />
      )}
    </div>
  );
}

function FilaOperador({ operador: o, elegido, alElegir }: { operador: OperadorSupervision; elegido: boolean; alElegir: () => void }) {
  const total = o.desenlaces.resuelta + o.desenlaces.falsa_alarma + o.desenlaces.escalada;
  return (
    <tr onClick={alElegir} className={`cursor-pointer border-b border-borde/50 last:border-0 ${elegido ? 'bg-acento/10' : 'hover:bg-superficie-2/60'}`}>
      <td className="px-3 py-2 font-ui whitespace-nowrap">
        <span className="font-semibold">{o.nombre}</span>
        <span className="text-tenue text-xs"> · {o.rol === 'admin' ? 'admin' : 'operador'}</span>
        {!o.activo && <span className="text-prio2 text-xs"> · inactivo</span>}
      </td>
      <td className="px-3 py-2 text-right">{o.tomadas}</td>
      <td className={`px-3 py-2 text-right ${(o.reaccionMediaSeg ?? 0) > 120 ? 'text-prio2' : ''}`}>{seg(o.reaccionMediaSeg)}</td>
      <td className={`px-3 py-2 text-right ${(o.reaccionMaxSeg ?? 0) > 600 ? 'text-prio1' : 'text-tenue'}`}>{seg(o.reaccionMaxSeg)}</td>
      <td className="px-3 py-2 text-right">{o.cerradas}</td>
      <td className="px-3 py-2 text-right">{seg(o.atencionMediaSeg)}</td>
      <td className="px-3 py-2 font-ui text-xs whitespace-nowrap">
        {total === 0 ? (
          <span className="text-tenue">—</span>
        ) : (
          <>
            <span className="text-ok">{o.desenlaces.resuelta} resueltas</span>
            {' · '}
            <span className="text-prio2">{o.desenlaces.falsa_alarma} falsas</span>
            {' · '}
            <span className="text-prio3">{o.desenlaces.escalada} escaladas</span>
          </>
        )}
      </td>
      <td className={`px-3 py-2 text-right ${o.cerradas > 0 && o.llamadas === 0 ? 'text-prio2' : ''}`}>{o.llamadas}</td>
      <td className="px-3 py-2 text-right">{o.notas}</td>
      <td className="px-3 py-2 text-right">{o.devoluciones}</td>
      <td className={`px-3 py-2 text-right ${o.hombreMuerto > 0 ? 'text-prio1 font-semibold' : ''}`}>{o.hombreMuerto}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {o.horasEnServicio} h<span className="text-tenue text-xs"> / {o.sesiones} ing.</span>
      </td>
      <td className="px-3 py-2 font-ui text-xs whitespace-nowrap">
        {o.enServicio ? (
          <span className="text-ok font-semibold">EN SERVICIO</span>
        ) : o.ultimaActividadEn ? (
          <span className="text-tenue">visto {transcurrido(o.ultimaActividadEn)}</span>
        ) : (
          <span className="text-tenue">nunca ingresó</span>
        )}
      </td>
    </tr>
  );
}

const NOMBRE_ACCION: Record<string, string> = { toma: 'Tomó', nota: 'Anotó', cierre: 'Cerró', sistema: 'Sistema', paso: 'Paso', llamada: 'Llamó' };

function Actividad({ operadorId, desde, hasta, alCerrar }: { operadorId: number; desde: string; hasta: string; alCerrar: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['actividad-operador', operadorId, desde, hasta],
    queryFn: () => verActividadOperador(operadorId, desde, hasta),
  });
  if (isLoading || !data) return <p className="text-tenue">Cargando la actividad…</p>;

  const motivosTexto = (o: string) => o;

  // Todo en una sola línea de tiempo: acciones, ingresos y avisos
  const lineas = [
    ...data.acciones.map((a) => ({
      cuando: a.creadoEn,
      clase: a.tipo === 'llamada' ? 'text-acento' : a.tipo === 'cierre' ? 'text-ok' : a.tipo === 'toma' ? '' : 'text-tenue',
      texto: `${NOMBRE_ACCION[a.tipo] ?? a.tipo} · ${a.codigo} ${a.descripcion} (${nombreCuenta(a.prefijo, a.numeroCuenta)}${a.clienteNombre ? ` ${a.clienteNombre}` : ''})${a.detalle ? `: ${motivosTexto(a.detalle)}` : ''}`,
    })),
    ...data.sesiones.map((s) => ({
      cuando: s.ingresoEn,
      clase: 'text-tenue italic',
      texto: `Ingresó a la consola${s.ip ? ` desde ${s.ip.replace('::ffff:', '')}` : ''}; última actividad ${fechaHora(s.ultimaActividadEn)}`,
    })),
    ...data.hombreMuerto.map((h) => ({ cuando: h.ocurridoEn, clase: 'text-prio1 font-semibold', texto: h.descripcion })),
  ].sort((a, b) => new Date(b.cuando).getTime() - new Date(a.cuando).getTime());

  return (
    <section className="bg-superficie border border-borde rounded-sm">
      <header className="flex items-center gap-3 px-3 py-2 border-b border-borde">
        <h2 className="font-semibold">{data.operador.nombre}</h2>
        <span className="text-tenue text-xs font-datos">{data.operador.email}</span>
        <span className="text-tenue text-xs">
          {data.acciones.length} acciones · {data.sesiones.length} ingresos
        </span>
        <button onClick={alCerrar} className="ml-auto text-tenue hover:text-texto" aria-label="Cerrar">
          ✕
        </button>
      </header>
      <ul className="p-3 flex flex-col gap-1 text-sm max-h-[50vh] overflow-y-auto">
        {lineas.map((l, i) => (
          <li key={i} className={`flex gap-3 ${l.clase}`}>
            <span className="font-datos text-xs text-tenue whitespace-nowrap pt-0.5">{fechaHora(l.cuando)}</span>
            <span>{l.texto}</span>
          </li>
        ))}
        {lineas.length === 0 && <li className="text-tenue">Sin actividad en el período.</li>}
      </ul>
      <p className="px-3 pb-3 text-xs text-tenue">
        Motivos de cierre: {Object.entries(MOTIVOS_CIERRE).map(([d, ms]) => `${ETIQUETA_DESENLACE[d as keyof typeof ETIQUETA_DESENLACE]}: ${ms.map((m) => m.etiqueta).join(', ')}`).join(' · ')}
      </p>
    </section>
  );
}
