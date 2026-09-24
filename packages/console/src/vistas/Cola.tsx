import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { anotarAlarma, devolverAlarma, listarAvisosPush, marcarPaso, listarAcciones, listarAlarmas, reabrirAlarma, tomarAlarma, tomarLote, verContexto } from '../api.js';
import type { Alarma, TipoSenal } from '../tipos.js';
import { duracionCorta, fechaHora, transcurrido } from '../tiempo.js';
import { CLASES_TIPO, clasesPrioridad, enPrueba, enVerificacion, nombreCuenta, NOMBRE_TIPO_PANEL, NOMBRE_TIPO_SENAL, ORDEN_TIPOS_SENAL, resumenAviso, tipoDe } from '../ui.js';
import { ModalSenal } from '../ModalSenal.js';
import { Modal } from '../Modal.js';
import { ETIQUETA_DESENLACE } from '../cierres.js';
import { Bitacora, FormularioCierre, ListaLlamadas } from './GestionAlarma.js';

const ORDEN_ESTADO = { nueva: 0, en_atencion: 1, cerrada: 2 } as const;
const NOMBRE_ESTADO = { nueva: 'NUEVA', en_atencion: 'EN ATENCIÓN', cerrada: 'CERRADA' } as const;

/**
 * Cola estilo central de comando (SIS): grilla densa de alarmas pendientes arriba,
 * panel de detalle fijo abajo con cuenta, lista de llamadas, historial y gestión.
 * El operador nunca navega a otra pantalla para procesar una alarma.
 */
export type FiltroCola = 'abiertas' | 'nueva' | 'en_atencion' | 'cerrada';

/** Tiempos de una alarma: cuánto esperó hasta tomarse y cuánto llevó atenderla. */
function tiempos(alarma: Alarma, ahora: number): { espera: number; atencion: number | null; tomada: boolean; cerrada: boolean } {
  const msCreada = new Date(alarma.creadoEn).getTime();
  const msTomada = alarma.tomadaEn ? new Date(alarma.tomadaEn).getTime() : null;
  const msCerrada = alarma.cerradaEn ? new Date(alarma.cerradaEn).getTime() : null;
  return {
    espera: (msTomada ?? msCerrada ?? ahora) - msCreada,
    atencion: msTomada === null ? null : (msCerrada ?? ahora) - msTomada,
    tomada: msTomada !== null,
    cerrada: msCerrada !== null,
  };
}

export function Cola({ alarmaReciente, filtro = 'abiertas' }: { alarmaReciente: number | null; filtro?: FiltroCola }) {
  // Las cerradas son otra consulta; nueva/en atención se filtran sobre las abiertas
  const cerradas = filtro === 'cerrada';
  const clienteConsultas = useQueryClient();
  const { data: alarmas, isLoading } = useQuery({
    queryKey: cerradas ? ['alarmas', 'cerrada'] : ['alarmas'],
    queryFn: () => listarAlarmas(cerradas ? 'cerrada' : undefined),
    refetchInterval: cerradas ? 60_000 : 15_000,
  });
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoSenal | null>(null);
  /*
   * Selección múltiple para procesar en lote: todas las de un cliente, todas
   * las de un tipo, o lo que el operador marque. Se guarda por id; lo que
   * deja de verse (se cerró, se filtró) deja de contar.
   */
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set());
  const [ultimaMarcada, setUltimaMarcada] = useState<number | null>(null);
  const [cerrandoLote, setCerrandoLote] = useState(false);

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(Date.now()), 5_000);
    return () => clearInterval(temporizador);
  }, []);

  const porTexto = useMemo(() => {
    const termino = filtroTexto.trim().toLowerCase();
    return (alarmas ?? []).filter(
      (a) =>
        (filtro === 'abiertas' || filtro === 'cerrada' ? true : a.estado === filtro) &&
        (!termino ||
          [a.evento.numeroCuenta, a.clienteNombre, a.evento.descripcion, a.evento.codigo, a.operadorNombre]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(termino))),
    );
  }, [alarmas, filtro, filtroTexto]);

  /** Cuántas hay de cada tipo (leyenda de colores, que además filtra) */
  const conteoTipos = useMemo(() => {
    const conteo = new Map<TipoSenal, number>();
    for (const a of porTexto) {
      const t = tipoDe(a.evento);
      conteo.set(t, (conteo.get(t) ?? 0) + 1);
    }
    return conteo;
  }, [porTexto]);

  const ordenadas = useMemo(() => {
    const visibles = filtroTipo ? porTexto.filter((a) => tipoDe(a.evento) === filtroTipo) : [...porTexto];
    if (cerradas) return visibles.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
    /*
     * Las alarmas nuevas de un mismo sitio van juntas, una debajo de otra:
     * el grupo se ubica por su alarma más urgente y más vieja, y adentro se
     * ordenan por hora. Todas se ven; ninguna se pliega. Un sensor con
     * rebote se lee como lo que es: diez señales seguidas del mismo lugar.
     */
    const clave = (a: Alarma) => (a.estado === 'nueva' && a.panelId !== null ? `p${a.panelId}` : `a${a.id}`);
    const rango = new Map<string, { prioridad: number; creado: number }>();
    for (const a of visibles) {
      const k = clave(a);
      const r = rango.get(k) ?? { prioridad: 9, creado: Infinity };
      rango.set(k, { prioridad: Math.min(r.prioridad, a.prioridad), creado: Math.min(r.creado, new Date(a.creadoEn).getTime()) });
    }
    return visibles.sort((a, b) => {
      const e = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado];
      if (e) return e;
      const ra = rango.get(clave(a))!;
      const rb = rango.get(clave(b))!;
      return ra.prioridad - rb.prioridad || ra.creado - rb.creado || clave(a).localeCompare(clave(b)) || a.prioridad - b.prioridad || new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime();
    });
  }, [porTexto, filtroTipo, cerradas]);

  /** Alarmas nuevas del mismo sitio que siguen a cada cabeza de grupo (para "Tomar las N"). */
  const grupos = useMemo(() => {
    const porPanel = new Map<number, Alarma[]>();
    if (!cerradas) {
      for (const a of ordenadas) {
        if (a.estado === 'nueva' && a.panelId !== null) porPanel.set(a.panelId, [...(porPanel.get(a.panelId) ?? []), a]);
      }
    }
    return porPanel;
  }, [ordenadas, cerradas]);

  const detalle = ordenadas.find((a) => a.id === seleccionada) ?? null;
  /** Otras alarmas abiertas del mismo sitio que la seleccionada: para cerrar en lote */
  const otrasDelSitio = detalle && detalle.panelId !== null
    ? ordenadas.filter((a) => a.id !== detalle.id && a.panelId === detalle.panelId && a.estado !== 'cerrada').map((a) => a.id)
    : [];

  // Lote efectivo: solo lo marcado que sigue a la vista
  const seleccion = cerradas ? [] : ordenadas.filter((a) => marcadas.has(a.id));
  const idsSeleccion = seleccion.map((a) => a.id);
  const conSeleccion = !cerradas && ordenadas.length > 0;

  /** Marca una fila; con Shift, todo el tramo desde la última marcada. */
  const marcar = (alarma: Alarma, conTramo: boolean) => {
    setMarcadas((previas) => {
      const n = new Set(previas);
      const desde = conTramo && ultimaMarcada !== null ? ordenadas.findIndex((a) => a.id === ultimaMarcada) : -1;
      const hasta = ordenadas.findIndex((a) => a.id === alarma.id);
      if (desde >= 0 && hasta >= 0) {
        for (const a of ordenadas.slice(Math.min(desde, hasta), Math.max(desde, hasta) + 1)) n.add(a.id);
      } else if (n.has(alarma.id)) n.delete(alarma.id);
      else n.add(alarma.id);
      return n;
    });
    setUltimaMarcada(alarma.id);
  };
  const marcarTodas = (si: boolean) => setMarcadas(si ? new Set(ordenadas.map((a) => a.id)) : new Set());

  /*
   * Ampliar la selección como se procesa en una central: "todas las de este
   * cliente", "todas las de este tipo", "todas con este código". Se calcula
   * sobre lo marcado y se ofrece solo si suma algo.
   */
  const ampliaciones = useMemo(() => {
    if (seleccion.length === 0) return [];
    const clientes = new Set(seleccion.map((a) => a.clienteId ?? `p${a.panelId}`));
    const tipos = new Set(seleccion.map((a) => tipoDe(a.evento)));
    const codigos = new Set(seleccion.map((a) => a.evento.codigo));
    const faltan = (criterio: (a: Alarma) => boolean) => ordenadas.filter((a) => !marcadas.has(a.id) && criterio(a));
    const opciones: { clave: string; etiqueta: string; alarmas: Alarma[] }[] = [
      { clave: 'cliente', etiqueta: clientes.size === 1 ? 'del mismo cliente' : 'de los mismos clientes', alarmas: faltan((a) => clientes.has(a.clienteId ?? `p${a.panelId}`)) },
      { clave: 'tipo', etiqueta: tipos.size === 1 ? `de tipo ${NOMBRE_TIPO_SENAL[[...tipos][0]!].toLowerCase()}` : 'de los mismos tipos', alarmas: faltan((a) => tipos.has(tipoDe(a.evento))) },
      { clave: 'codigo', etiqueta: codigos.size === 1 ? `con código ${[...codigos][0]}` : 'con los mismos códigos', alarmas: faltan((a) => codigos.has(a.evento.codigo)) },
    ];
    return opciones.filter((o) => o.alarmas.length > 0);
  }, [seleccion, ordenadas, marcadas]);

  const tomarSeleccion = useMutation({
    mutationFn: () => tomarLote(idsSeleccion),
    onSuccess: () => void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] }),
  });

  if (isLoading) return <p className="text-tenue">Cargando la cola…</p>;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          placeholder="Filtrar por cuenta, cliente, código u operador…"
          className="bg-superficie border border-borde rounded-sm px-3 py-1.5 text-sm w-80 font-datos"
        />
        {/* Leyenda de colores: un chip por tipo presente; clic para ver solo ese tipo */}
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filtrar por tipo de señal">
          {ORDEN_TIPOS_SENAL.filter((t) => (conteoTipos.get(t) ?? 0) > 0).map((t) => {
            const activo = filtroTipo === t;
            const clases = CLASES_TIPO[t];
            return (
              <button
                key={t}
                onClick={() => setFiltroTipo(activo ? null : t)}
                aria-pressed={activo}
                className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-ui ${
                  activo ? `${clases.borde} ${clases.fondo} ${clases.texto} font-semibold` : 'border-borde text-tenue hover:text-texto'
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${clases.barra}`} aria-hidden />
                {NOMBRE_TIPO_SENAL[t]}
                <span className="font-datos">{conteoTipos.get(t)}</span>
              </button>
            );
          })}
        </div>
        {(filtroTexto || filtroTipo) && (
          <span className="text-xs text-tenue font-datos">
            {ordenadas.length} de {(alarmas ?? []).length}
          </span>
        )}
      </div>

      {seleccion.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-acento/10 border border-acento/40 rounded-sm px-3 py-1.5 text-sm">
          <span className="font-datos font-semibold text-acento">{seleccion.length} seleccionadas</span>
          {ampliaciones.length > 0 && (
            <>
              <span className="text-tenue font-ui text-xs">Sumar las</span>
              {ampliaciones.map((o) => (
                <button
                  key={o.clave}
                  onClick={() => setMarcadas((previas) => new Set([...previas, ...o.alarmas.map((a) => a.id)]))}
                  className="border border-borde rounded-sm px-2 py-0.5 text-xs font-ui hover:bg-superficie-2"
                >
                  {o.alarmas.length} {o.etiqueta}
                </button>
              ))}
            </>
          )}
          <span className="flex-1" />
          {seleccion.some((a) => a.estado === 'nueva') && (
            <button
              onClick={() => tomarSeleccion.mutate()}
              disabled={tomarSeleccion.isPending}
              className="bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-2.5 py-0.5 text-xs font-ui font-semibold disabled:opacity-50"
            >
              Tomar {seleccion.filter((a) => a.estado === 'nueva').length}
            </button>
          )}
          <button
            onClick={() => setCerrandoLote(true)}
            className="bg-prio1/15 hover:bg-prio1/25 border border-prio1 text-prio1 rounded-sm px-2.5 py-0.5 text-xs font-ui font-semibold"
          >
            Cerrar {seleccion.length}…
          </button>
          <button onClick={() => marcarTodas(false)} className="text-tenue hover:text-texto text-xs font-ui px-1">
            Quitar selección
          </button>
          {tomarSeleccion.isError && <span className="text-prio2 text-xs font-ui">{(tomarSeleccion.error as Error).message}</span>}
        </div>
      )}

      <div className="flex-1 min-h-0 bg-superficie border border-borde rounded-sm overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-superficie-2 z-10">
            <tr className="text-left text-tenue text-xs uppercase tracking-wider">
              <th className="w-1 p-0" aria-label="Tipo de señal" />
              {conSeleccion && (
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las visibles"
                    checked={seleccion.length > 0 && seleccion.length === ordenadas.length}
                    ref={(el) => {
                      if (el) el.indeterminate = seleccion.length > 0 && seleccion.length < ordenadas.length;
                    }}
                    onChange={(e) => marcarTodas(e.target.checked)}
                    className="accent-[var(--color-acento)] align-middle"
                  />
                </th>
              )}
              <th className="px-3 py-2 font-medium">Hora</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 font-medium">Cuenta</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Usuario / Zona</th>
              {cerradas ? (
                <>
                  <th className="px-3 py-2 font-medium">Desenlace</th>
                  <th className="px-3 py-2 font-medium">Operador</th>
                  <th className="px-3 py-2 font-medium text-right">Reacción</th>
                  <th className="px-3 py-2 font-medium text-right">Atención</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Operador</th>
                  <th className="px-3 py-2 font-medium text-right">Espera</th>
                  <th className="px-3 py-2" aria-label="Acciones" />
                </>
              )}
            </tr>
          </thead>
          <tbody className="font-datos">
            {ordenadas.map((alarma) => {
              const delSitio = alarma.estado === 'nueva' && alarma.panelId !== null ? (grupos.get(alarma.panelId) ?? []) : [];
              const posicion = delSitio.findIndex((x) => x.id === alarma.id);
              return (
                <FilaAlarma
                  key={alarma.id}
                  alarma={alarma}
                  ahora={ahora}
                  cerradas={cerradas}
                  reciente={alarma.id === alarmaReciente}
                  seleccionada={alarma.id === seleccionada}
                  alSeleccionar={() => setSeleccionada(alarma.id === seleccionada ? null : alarma.id)}
                  alTomar={() => setSeleccionada(alarma.id)}
                  grupo={delSitio.length > 1 && posicion === 0 ? delSitio.slice(1) : []}
                  continuacion={delSitio.length > 1 && posicion > 0}
                  marcada={conSeleccion ? marcadas.has(alarma.id) : undefined}
                  alMarcar={(conTramo) => marcar(alarma, conTramo)}
                />
              );
            })}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-tenue font-ui">
                  {cerradas
                    ? 'Sin alarmas cerradas todavía.'
                    : filtroTipo
                      ? `Sin alarmas de tipo ${NOMBRE_TIPO_SENAL[filtroTipo].toLowerCase()} en este momento.`
                      : 'Sin alarmas en este estado. El receptor sigue escuchando; las nuevas aparecen aquí al instante.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && <PanelDetalle alarma={detalle} otrasDelSitio={otrasDelSitio} alCerrarPanel={() => setSeleccionada(null)} />}

      {cerrandoLote && seleccion.length > 0 && (
        <Modal titulo={`Cerrar ${seleccion.length} alarmas con el mismo cierre`} alCerrar={() => setCerrandoLote(false)}>
          <ResumenLote alarmas={seleccion} />
          <FormularioCierre
            lote={idsSeleccion}
            alCerrar={() => {
              setCerrandoLote(false);
              marcarTodas(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** Qué se va a cerrar: cuántas por tipo y de qué clientes, para que nadie cierre a ciegas. */
function ResumenLote({ alarmas }: { alarmas: Alarma[] }) {
  const porTipo = new Map<TipoSenal, number>();
  const clientes = new Set<string>();
  for (const a of alarmas) {
    const t = tipoDe(a.evento);
    porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
    clientes.add(a.clienteNombre ?? nombreCuenta(a.prefijo, a.evento.numeroCuenta));
  }
  return (
    <div className="text-sm font-ui flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        {ORDEN_TIPOS_SENAL.filter((t) => porTipo.has(t)).map((t) => (
          <span key={t} className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs ${CLASES_TIPO[t].borde} ${CLASES_TIPO[t].texto}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${CLASES_TIPO[t].barra}`} aria-hidden />
            {porTipo.get(t)} {NOMBRE_TIPO_SENAL[t].toLowerCase()}
          </span>
        ))}
      </div>
      <p className="text-tenue text-xs">
        {clientes.size === 1 ? 'Cliente: ' : `${clientes.size} clientes: `}
        {[...clientes].slice(0, 6).join(', ')}
        {clientes.size > 6 && ` y ${clientes.size - 6} más`}
      </p>
    </div>
  );
}

function FilaAlarma({
  alarma,
  ahora,
  cerradas,
  reciente,
  seleccionada,
  alSeleccionar,
  alTomar,
  grupo = [],
  continuacion = false,
  marcada,
  alMarcar,
}: {
  alarma: Alarma;
  ahora: number;
  cerradas: boolean;
  reciente: boolean;
  seleccionada: boolean;
  alSeleccionar: () => void;
  alTomar: () => void;
  /** Otras alarmas nuevas del mismo sitio que siguen a esta (solo en la primera del grupo) */
  grupo?: Alarma[];
  /** true si esta fila continúa el grupo de la fila anterior (mismo sitio) */
  continuacion?: boolean;
  /** Casilla de selección para lote: undefined = sin columna de selección */
  marcada?: boolean;
  alMarcar?: (conTramo: boolean) => void;
}) {
  const clienteConsultas = useQueryClient();
  const prio = clasesPrioridad(alarma.prioridad);
  const tipo = CLASES_TIPO[tipoDe(alarma.evento)];
  const tomar = useMutation({
    mutationFn: () => tomarAlarma(alarma.id),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
      // Tomarla es empezar a trabajarla: se abre el detalle sin un segundo clic
      alTomar();
    },
    onError: () => void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] }),
  });
  const tomarTodas = useMutation({
    mutationFn: () => tomarLote([alarma.id, ...grupo.map((g) => g.id)]),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
      alTomar();
    },
  });
  const t = tiempos(alarma, ahora);
  // Esperando el desarmado del usuario: se ve, atenuada, pero todavía no es del operador
  const verificando = enVerificacion(alarma, ahora);
  const segundosVerificacion = verificando ? Math.max(0, Math.ceil((new Date(alarma.enVerificacionHasta!).getTime() - ahora) / 1000)) : 0;

  // Como en toda central: la fila entera de una alarma real sin atender se pinta.
  const fondoFila = verificando
    ? 'opacity-60 hover:opacity-80'
    : alarma.estado === 'nueva' && alarma.prioridad <= 1
      ? 'bg-prio1/20 hover:bg-prio1/25'
      : alarma.estado === 'nueva' && alarma.prioridad === 2
        ? 'bg-prio2/10 hover:bg-prio2/15'
        : 'hover:bg-superficie-2/60';

  return (
    <tr
      onClick={alSeleccionar}
      className={`cursor-pointer border-b border-borde/40 ${
        seleccionada ? 'bg-acento/10' : marcada ? 'bg-acento/5' : fondoFila
      } ${reciente ? 'alarma-nueva' : ''}`}
    >
      <td className={`p-0 ${tipo.barra}`} aria-hidden />
      {marcada !== undefined && (
        <td className="px-2 py-1.5 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={marcada}
            aria-label="Seleccionar para procesar en lote"
            onClick={(e) => alMarcar?.(e.shiftKey)}
            onChange={() => undefined}
            className="accent-[var(--color-acento)] align-middle cursor-pointer"
          />
        </td>
      )}
      <td className="px-3 py-1.5 text-tenue whitespace-nowrap">{fechaHora(alarma.evento.ocurridoEn)}</td>
      <td className={`px-3 py-1.5 font-semibold whitespace-nowrap ${tipo.texto}`} title={NOMBRE_TIPO_SENAL[tipoDe(alarma.evento)]}>
        {alarma.evento.codigo}
      </td>
      <td className="px-3 py-1.5 font-ui">
        {continuacion && (
          <span className="text-tenue mr-1.5" aria-hidden title="Del mismo sitio que la anterior">
            ↳
          </span>
        )}
        {alarma.evento.descripcion}
        {grupo.length > 0 && (
          <span className="ml-2 font-datos text-xs text-tenue" title="Las que siguen son del mismo sitio">
            {grupo.length + 1} de este sitio
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {nombreCuenta(alarma.prefijo, alarma.evento.numeroCuenta)}
        {alarma.clienteNombre && <span className="font-ui text-texto"> {alarma.clienteNombre}</span>}
      </td>
      <td className="px-3 py-1.5 text-tenue">
        {alarma.evento.zona ?? '—'}
        {alarma.zonaDescripcion && <span className="font-ui text-texto"> - {alarma.zonaDescripcion}</span>}
      </td>
      {cerradas ? (
        <>
          <td className="px-3 py-1.5 font-ui text-xs">
            <span className={alarma.desenlace === 'falsa_alarma' ? 'text-prio2' : alarma.desenlace === 'escalada' ? 'text-prio3' : 'text-ok'}>
              {alarma.desenlace ? ETIQUETA_DESENLACE[alarma.desenlace] : '—'}
            </span>
            {alarma.resolucion && <span className="text-tenue"> · {alarma.resolucion}</span>}
          </td>
          <td className="px-3 py-1.5 font-ui text-tenue whitespace-nowrap">{alarma.operadorNombre ?? '—'}</td>
          <td className="px-3 py-1.5 text-right text-tenue whitespace-nowrap">{duracionCorta(t.espera)}</td>
          <td className="px-3 py-1.5 text-right text-tenue whitespace-nowrap">{t.atencion === null ? '—' : duracionCorta(t.atencion)}</td>
        </>
      ) : (
        <>
          <td className={`px-3 py-1.5 text-xs whitespace-nowrap ${verificando ? 'text-tenue' : alarma.estado === 'nueva' ? prio.texto : 'text-acento'}`}>
            {verificando ? (
              <span title="Esperando el desarmado del usuario; si no llega, se presenta como nueva">VERIFICANDO {segundosVerificacion} s</span>
            ) : (
              NOMBRE_ESTADO[alarma.estado]
            )}
            {alarma.restauradaEn && (
              <span className="ml-1.5 text-ok" title={`El panel reportó la restauración ${fechaHora(alarma.restauradaEn)}`}>
                RESTAURADA
              </span>
            )}
          </td>
          <td className="px-3 py-1.5 font-ui text-tenue whitespace-nowrap">{alarma.operadorNombre ?? ''}</td>
          <td className={`px-3 py-1.5 text-right whitespace-nowrap ${alarma.estado === 'nueva' ? prio.texto : 'text-tenue'}`}>
            {alarma.estado === 'nueva' ? transcurrido(alarma.creadoEn, ahora) : t.atencion !== null ? duracionCorta(t.atencion) : ''}
          </td>
          <td className="px-3 py-1.5 text-right whitespace-nowrap">
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
            {alarma.estado === 'nueva' && grupo.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  tomarTodas.mutate();
                }}
                disabled={tomarTodas.isPending}
                title="Tomar esta y las demás nuevas del sitio"
                className="ml-1 bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-2.5 py-0.5 text-xs font-ui font-semibold disabled:opacity-50"
              >
                Tomar las {grupo.length + 1}
              </button>
            )}
            {tomar.isError && <span className="ml-2 text-prio2 text-xs font-ui">{(tomar.error as Error).message}</span>}
          </td>
        </>
      )}
    </tr>
  );
}

function PanelDetalle({ alarma, otrasDelSitio, alCerrarPanel }: { alarma: Alarma; otrasDelSitio: number[]; alCerrarPanel: () => void }) {
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
  const [senalVisible, setSenalVisible] = useState(false);

  // Reloj propio para que los tiempos de la cabecera corran a la vista
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
  }

  const tomar = useMutation({ mutationFn: () => tomarAlarma(alarma.id), onSuccess: refrescar, onError: refrescar });
  const devolver = useMutation({ mutationFn: () => devolverAlarma(alarma.id), onSuccess: refrescar });
  const reabrir = useMutation({
    mutationFn: () => reabrirAlarma(alarma.id),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas', 'cerrada'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
    },
  });
  const anotar = useMutation({
    mutationFn: () => anotarAlarma(alarma.id, nota),
    onSuccess: () => {
      setNota('');
      refrescar();
    },
  });
  const paso = useMutation({
    mutationFn: (texto: string) => marcarPaso(alarma.id, texto),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['contexto', alarma.id] });
      void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
    },
  });

  // Dos tiempos distintos: cuánto tardó en tomarse, y cuánto lleva en atención.
  // El segundo corre en vivo mientras la alarma sigue abierta.
  const t = tiempos(alarma, ahora);
  const prio = clasesPrioridad(alarma.prioridad);
  const abierta = alarma.estado !== 'cerrada';

  return (
    <section className="h-[48vh] min-h-[26rem] shrink-0 bg-superficie border border-borde rounded-sm flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-borde bg-superficie-2">
        <span className={`font-datos font-semibold ${prio.texto}`}>{alarma.evento.codigo}</span>
        <span className="font-semibold">{alarma.evento.descripcion}</span>
        <span className="font-datos text-xs text-tenue">
          {fechaHora(alarma.evento.ocurridoEn)} · {NOMBRE_ESTADO[alarma.estado]}
          {alarma.operadorNombre && <span className="text-texto"> · {alarma.operadorNombre}</span>}
          {alarma.restauradaEn && <span className="text-ok"> · RESTAURADA {fechaHora(alarma.restauradaEn)}</span>}
        </span>
        <span className="font-datos text-xs flex items-center gap-2" title="Tiempo hasta tomarla y tiempo en atención">
          <span className={!t.tomada && !t.cerrada && t.espera > 60_000 ? 'text-prio1 font-semibold' : 'text-tenue'}>
            espera {duracionCorta(t.espera)}
          </span>
          {t.atencion !== null && (
            <span className={!t.cerrada ? 'text-acento' : 'text-tenue'}>atención {duracionCorta(t.atencion)}</span>
          )}
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
        {alarma.estado === 'en_atencion' && (
          <button
            onClick={() => devolver.mutate()}
            disabled={devolver.isPending}
            title="Vuelve a la cola como nueva para que otro operador la tome"
            className="ml-2 text-tenue hover:text-texto text-xs font-datos underline underline-offset-2 disabled:opacity-50"
          >
            Devolver a la cola
          </button>
        )}
        {alarma.estado === 'cerrada' && (
          <button
            onClick={() => reabrir.mutate()}
            disabled={reabrir.isPending}
            title="Vuelve a atención, a su nombre, con rastro en la bitácora"
            className="ml-2 text-tenue hover:text-texto text-xs font-datos underline underline-offset-2 disabled:opacity-50"
          >
            Reabrir
          </button>
        )}
        {tomar.isError && <span className="text-prio2 text-xs">{(tomar.error as Error).message}</span>}
        {alarma.evento.senalId && (
          <button
            onClick={() => setSenalVisible(true)}
            className="text-tenue hover:text-acento text-xs font-datos underline underline-offset-2"
          >
            Ver señal
          </button>
        )}
        <button onClick={alCerrarPanel} className="ml-auto text-tenue hover:text-texto" aria-label="Cerrar panel">
          ✕
        </button>
      </header>
      {senalVisible && alarma.evento.senalId && (
        <ModalSenal senalId={alarma.evento.senalId} alCerrar={() => setSenalVisible(false)} />
      )}

      <div className="flex-1 min-h-0 grid grid-cols-3 divide-x divide-borde">
        {/* Cuenta y lista de llamadas */}
        <div className="p-3 overflow-y-auto text-sm flex flex-col gap-2">
          <h3 className="text-tenue text-xs uppercase tracking-wider">Cuenta</h3>
          {contexto?.cliente ? (
            <>
              {/* El plan del sitio manda sobre el del cliente */}
              {(contexto.sitio?.instrucciones || contexto.cliente.instrucciones) && (
                <div className="bg-prio2/10 border border-prio2/40 rounded-sm p-2">
                  <h3 className="text-prio2 text-xs uppercase tracking-wider mb-1">
                    Plan de acción{contexto.sitio?.instrucciones ? ' del sitio' : ''}
                  </h3>
                  <p className="whitespace-pre-wrap">
                    {contexto.sitio?.instrucciones ?? contexto.cliente.instrucciones}
                  </p>
                </div>
              )}
              {contexto.cliente.estado !== 'activo' && (
                <p className="text-prio2 text-xs font-semibold uppercase tracking-wider">
                  Cliente {contexto.cliente.estado}
                  {contexto.cliente.motivoEstado && <span className="font-normal normal-case"> — {contexto.cliente.motivoEstado}</span>}
                </p>
              )}
              <div>
                <p className="font-semibold">{contexto.cliente.nombre}</p>
                <p className="text-tenue">
                  {contexto.sitio?.nombre}
                  {contexto.sitio?.direccion && ` · ${contexto.sitio.direccion}`}
                  {contexto.sitio?.ciudad && `, ${contexto.sitio.ciudad}`}
                </p>
                {contexto.sitio?.referencia && <p className="text-tenue text-xs">Ref.: {contexto.sitio.referencia}</p>}
                {(contexto.sitio?.llaves || contexto.sitio?.instruccionesAcceso) && (
                  <p className="text-tenue text-xs">
                    {contexto.sitio.llaves && `Llaves: ${contexto.sitio.llaves}`}
                    {contexto.sitio.llaves && contexto.sitio.instruccionesAcceso && ' · '}
                    {contexto.sitio.instruccionesAcceso}
                  </p>
                )}
                <p className="font-datos text-xs text-tenue mt-1">
                  cuenta {nombreCuenta(contexto.panel?.prefijo, contexto.panel?.numeroCuenta)} · {NOMBRE_TIPO_PANEL[contexto.panel?.tipo ?? ''] ?? contexto.panel?.tipo}
                  {contexto.panel?.modelo && ` ${contexto.panel.modelo}`}
                  {contexto.sitio?.telefono && ` · sitio ${contexto.sitio.telefono}`}
                  {contexto.panel?.ultimaSenalEn && ` · última señal ${transcurrido(contexto.panel.ultimaSenalEn)}`}
                  {contexto.panel?.instalador && ` · instaló ${contexto.panel.instalador}`}
                </p>
                {enPrueba(contexto.panel) && (
                  <p className="text-prio2 text-xs font-semibold uppercase tracking-wider mt-1" title={contexto.panel?.enPruebaMotivo ?? ''}>
                    Cuenta en prueba hasta {fechaHora(contexto.panel!.enPruebaHasta!)}
                    {contexto.panel?.enPruebaMotivo && <span className="normal-case tracking-normal font-normal text-tenue"> · {contexto.panel.enPruebaMotivo}</span>}
                  </p>
                )}
                {contexto.horarios.length > 0 && (
                  <p className="font-datos text-xs text-tenue">
                    Horario: {contexto.horarios.map((h) => `${h.dias.replace(/-/g, '')} ${h.apertura}–${h.cierre}`).join(' · ')}
                  </p>
                )}
                {contexto.usuariosPanel.length > 0 && (
                  <details className="text-xs mt-0.5">
                    <summary className="text-tenue cursor-pointer">Usuarios con código ({contexto.usuariosPanel.length})</summary>
                    <ul className="font-datos text-tenue pl-3">
                      {contexto.usuariosPanel.map((u) => (
                        <li key={u.id}>
                          {Number(u.numero)}: <span className="text-texto">{u.nombre}</span>
                          {u.telefono && ` · ${u.telefono}`}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {contexto.sitio?.latitud != null && contexto.sitio?.longitud != null && (
                  <a
                    href={`https://www.google.com/maps?q=${contexto.sitio.latitud},${contexto.sitio.longitud}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-acento text-xs underline underline-offset-2"
                  >
                    Ver ubicación en el mapa
                  </a>
                )}
                {contexto.zonaDescripcion && (
                  <p className="mt-1">
                    <span className="text-tenue">Zona {alarma.evento.zona}:</span>{' '}
                    <span className="font-semibold">{contexto.zonaDescripcion}</span>
                  </p>
                )}
              </div>
              <h3 className="text-tenue text-xs uppercase tracking-wider mt-1">Lista de llamadas</h3>
              <ListaLlamadas alarma={alarma} contactos={contexto.contactos} />
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
          <Bitacora acciones={acciones} />
          <AvisosAlCliente eventoId={alarma.evento.id} />
          {(contexto?.previas.length ?? 0) > 0 && (
            <>
              <h3 className="text-tenue text-xs uppercase tracking-wider mt-3 mb-1">Últimas alarmas de este sitio</h3>
              <ul className="flex flex-col gap-1 text-xs">
                {contexto!.previas.map((p) => (
                  <li key={p.id} className="text-tenue">
                    <span className="font-datos">{fechaHora(p.creadoEn)}</span> <span className="text-texto">{p.codigo} {p.descripcion}</span>
                    {p.desenlace && (
                      <span className={p.desenlace === 'falsa_alarma' ? 'text-prio2' : 'text-ok'}> · {ETIQUETA_DESENLACE[p.desenlace]}</span>
                    )}
                    {p.resolucion && <span> · {p.resolucion}</span>}
                    {p.operadorNombre && <span> · {p.operadorNombre}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Gestión */}
        <div className="p-3 flex flex-col gap-2 text-sm overflow-y-auto">
          {/*
            Protocolo del tipo de evento. Es una guía, no una obligación: se
            puede cerrar sin marcar todo. Lo marcado se deduce de la bitácora,
            así que la casilla y el historial nunca pueden contradecirse.
          */}
          {(contexto?.pasos.length ?? 0) > 0 && (
            <>
              <h3 className="text-tenue text-xs uppercase tracking-wider">Protocolo</h3>
              <ul className="flex flex-col gap-0.5 -mt-1">
                {contexto!.pasos.map((texto) => {
                  const hecho = contexto!.pasosCumplidos.includes(texto);
                  return (
                    <li key={texto}>
                      <button
                        onClick={() => paso.mutate(texto)}
                        disabled={hecho || paso.isPending || !abierta}
                        className={`flex items-start gap-2 text-left w-full py-0.5 ${
                          hecho ? 'text-tenue' : 'hover:text-acento'
                        } disabled:cursor-default`}
                      >
                        <span
                          className={`mt-0.5 w-3.5 h-3.5 shrink-0 rounded-sm border flex items-center justify-center text-[10px] ${
                            hecho ? 'bg-ok border-ok text-fondo' : 'border-borde'
                          }`}
                        >
                          {hecho ? '✓' : ''}
                        </span>
                        <span className={hecho ? 'line-through' : ''}>{texto}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {abierta ? (
            <>
              <h3 className="text-tenue text-xs uppercase tracking-wider">Gestión</h3>
              {/* shrink-0: la columna scrollea; los campos no se aplastan para caber */}
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Anotar una gestión (verificación, observación…)"
                rows={2}
                className="shrink-0 bg-fondo border border-borde rounded-sm px-2.5 py-1.5 resize-none"
              />
              <button
                onClick={() => anotar.mutate()}
                disabled={!nota.trim() || anotar.isPending}
                className="shrink-0 self-end bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1 text-xs font-semibold disabled:opacity-50"
              >
                Agregar nota
              </button>
              <h3 className="shrink-0 text-tenue text-xs uppercase tracking-wider mt-2">Cierre</h3>
              <FormularioCierre alarma={alarma} otrasDelSitio={otrasDelSitio} alCerrar={alCerrarPanel} />
            </>
          ) : (
            <div className="mt-auto text-xs text-tenue">
              <p>
                Cerrada {alarma.cerradaEn && fechaHora(alarma.cerradaEn)}
                {alarma.operadorNombre && ` por ${alarma.operadorNombre}`}
              </p>
              {alarma.desenlace && (
                <p className="text-texto mt-1">
                  {ETIQUETA_DESENLACE[alarma.desenlace]}
                  {alarma.resolucion && `: ${alarma.resolucion}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** A quién le avisó la app por este evento y si le llegó: la respuesta a "¿el cliente ya sabe?". */
function AvisosAlCliente({ eventoId }: { eventoId: number }) {
  const { data: avisos } = useQuery({ queryKey: ['avisos-push', eventoId], queryFn: () => listarAvisosPush([eventoId]), refetchInterval: 20_000 });
  if (!avisos || avisos.length === 0) return null;
  return (
    <div>
      <h3 className="text-tenue text-xs uppercase tracking-wider mt-3 mb-1">Avisos al cliente (app)</h3>
      <ul className="text-xs font-ui flex flex-col gap-0.5">
        {avisos.map((a) => {
          const r = resumenAviso(a);
          return (
            <li key={a.id} className="flex items-center gap-2">
              <span className="font-semibold">{a.usuarioNombre}</span>
              <span className={r.clase}>{r.texto}</span>
              <span className="text-tenue font-datos">
                {fechaHora(a.enviadoEn).slice(-8)}
                {a.recibidoEn && ` → ${fechaHora(a.recibidoEn).slice(-8)}`}
              </span>
              {a.detalle && a.resultado !== 'enviado' && <span className="text-tenue">· {a.detalle}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
