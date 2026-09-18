import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { anotarAlarma, devolverAlarma, marcarPaso, listarAcciones, listarAlarmas, reabrirAlarma, tomarAlarma, tomarLote, verContexto } from '../api.js';
import type { Alarma } from '../tipos.js';
import { duracionCorta, fechaHora, transcurrido } from '../tiempo.js';
import { clasesPrioridad, nombreCuenta, NOMBRE_TIPO_PANEL } from '../ui.js';
import { ModalSenal } from '../ModalSenal.js';
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
  const { data: alarmas, isLoading } = useQuery({
    queryKey: cerradas ? ['alarmas', 'cerrada'] : ['alarmas'],
    queryFn: () => listarAlarmas(cerradas ? 'cerrada' : undefined),
    refetchInterval: cerradas ? 60_000 : 15_000,
  });
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [filtroTexto, setFiltroTexto] = useState('');
  // Sitios cuyo grupo de alarmas nuevas se muestra desplegado
  const [desplegados, setDesplegados] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(temporizador);
  }, []);

  const ordenadas = useMemo(() => {
    const termino = filtroTexto.trim().toLowerCase();
    const visibles = (alarmas ?? []).filter(
      (a) =>
        (filtro === 'abiertas' || filtro === 'cerrada' ? true : a.estado === filtro) &&
        (!termino ||
          [a.evento.numeroCuenta, a.clienteNombre, a.evento.descripcion, a.evento.codigo, a.operadorNombre]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(termino))),
    );
    return visibles.sort((a, b) =>
      cerradas
        ? new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime()
        : ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
          a.prioridad - b.prioridad ||
          new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
    );
  }, [alarmas, filtro, cerradas, filtroTexto]);

  /*
   * Agrupación por sitio: las alarmas NUEVAS de un mismo panel se muestran
   * como una sola fila con "+N", plegadas por defecto. Un sensor con rebote
   * genera diez filas iguales; en la cola tienen que verse como un solo
   * problema que se toma y se cierra de una vez.
   */
  const { filas, ocultasPorPanel } = useMemo(() => {
    if (cerradas) return { filas: ordenadas, ocultasPorPanel: new Map<number, Alarma[]>() };
    const vistas = new Map<number, Alarma>();
    const ocultas = new Map<number, Alarma[]>();
    const salida: Alarma[] = [];
    for (const a of ordenadas) {
      if (a.estado !== 'nueva' || a.panelId === null) {
        salida.push(a);
        continue;
      }
      const cabeza = vistas.get(a.panelId);
      if (!cabeza) {
        vistas.set(a.panelId, a);
        salida.push(a);
      } else if (desplegados.has(a.panelId) || a.id === seleccionada) {
        salida.push(a);
        ocultas.set(a.panelId, [...(ocultas.get(a.panelId) ?? []), a]);
      } else {
        ocultas.set(a.panelId, [...(ocultas.get(a.panelId) ?? []), a]);
      }
    }
    return { filas: salida, ocultasPorPanel: ocultas };
  }, [ordenadas, cerradas, desplegados, seleccionada]);

  const detalle = ordenadas.find((a) => a.id === seleccionada) ?? null;
  /** Otras alarmas abiertas del mismo sitio que la seleccionada: para cerrar en lote */
  const otrasDelSitio = detalle && detalle.panelId !== null
    ? ordenadas.filter((a) => a.id !== detalle.id && a.panelId === detalle.panelId && a.estado !== 'cerrada').map((a) => a.id)
    : [];

  if (isLoading) return <p className="text-tenue">Cargando la cola…</p>;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          placeholder="Filtrar por cuenta, cliente, código u operador…"
          className="bg-superficie border border-borde rounded-sm px-3 py-1.5 text-sm w-80 font-datos"
        />
        {filtroTexto && (
          <span className="text-xs text-tenue font-datos">
            {ordenadas.length} de {(alarmas ?? []).length}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 bg-superficie border border-borde rounded-sm overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-superficie-2 z-10">
            <tr className="text-left text-tenue text-xs uppercase tracking-wider">
              <th className="w-1 p-0" aria-label="Prioridad" />
              <th className="px-3 py-2 font-medium">Hora</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 font-medium">Cuenta</th>
              <th className="px-3 py-2 font-medium">Usuario / Zona</th>
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
            {filas.map((alarma) => {
              const esCabeza = !cerradas && alarma.estado === 'nueva' && alarma.panelId !== null && (ocultasPorPanel.get(alarma.panelId)?.length ?? 0) > 0 && ordenadas.find((x) => x.panelId === alarma.panelId && x.estado === 'nueva') === alarma;
              const grupo = esCabeza ? ocultasPorPanel.get(alarma.panelId!) ?? [] : [];
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
                  grupo={grupo}
                  desplegado={alarma.panelId !== null && desplegados.has(alarma.panelId)}
                  alDesplegar={() =>
                    setDesplegados((d) => {
                      const n = new Set(d);
                      if (n.has(alarma.panelId!)) n.delete(alarma.panelId!);
                      else n.add(alarma.panelId!);
                      return n;
                    })
                  }
                />
              );
            })}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-tenue font-ui">
                  {cerradas
                    ? 'Sin alarmas cerradas todavía.'
                    : 'Sin alarmas en este estado. El receptor sigue escuchando; las nuevas aparecen aquí al instante.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && <PanelDetalle alarma={detalle} otrasDelSitio={otrasDelSitio} alCerrarPanel={() => setSeleccionada(null)} />}
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
  desplegado = false,
  alDesplegar,
}: {
  alarma: Alarma;
  ahora: number;
  cerradas: boolean;
  reciente: boolean;
  seleccionada: boolean;
  alSeleccionar: () => void;
  alTomar: () => void;
  /** Otras alarmas nuevas del mismo sitio, plegadas bajo esta fila */
  grupo?: Alarma[];
  desplegado?: boolean;
  alDesplegar?: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const prio = clasesPrioridad(alarma.prioridad);
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

  // Como en toda central: la fila entera de una alarma real sin atender se pinta.
  const fondoFila =
    alarma.estado === 'nueva' && alarma.prioridad <= 1
      ? 'bg-prio1/20 hover:bg-prio1/25'
      : alarma.estado === 'nueva' && alarma.prioridad === 2
        ? 'bg-prio2/10 hover:bg-prio2/15'
        : 'hover:bg-superficie-2/60';

  return (
    <tr
      onClick={alSeleccionar}
      className={`cursor-pointer border-b border-borde/40 ${
        seleccionada ? 'bg-acento/10' : fondoFila
      } ${reciente ? 'alarma-nueva' : ''}`}
    >
      <td className={`p-0 ${prio.barra}`} aria-hidden />
      <td className="px-3 py-1.5 text-tenue whitespace-nowrap">{fechaHora(alarma.evento.ocurridoEn)}</td>
      <td className={`px-3 py-1.5 font-semibold ${prio.texto}`}>{alarma.evento.codigo}</td>
      <td className="px-3 py-1.5 font-ui">
        {alarma.evento.descripcion}
        {grupo.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              alDesplegar?.();
            }}
            title={desplegado ? 'Plegar las demás de este sitio' : 'Ver las demás de este sitio'}
            className="ml-2 font-datos text-xs border border-borde rounded-sm px-1.5 py-0.5 text-tenue hover:text-texto"
          >
            {desplegado ? '−' : '+'}{grupo.length} del mismo sitio
          </button>
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
          <td className={`px-3 py-1.5 text-xs ${alarma.estado === 'nueva' ? prio.texto : 'text-acento'}`}>
            {NOMBRE_ESTADO[alarma.estado]}
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
