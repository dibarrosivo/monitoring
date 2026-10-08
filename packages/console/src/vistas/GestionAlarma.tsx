import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cerrarAlarma, cerrarLote, listarEventosDePanel, registrarLlamada } from '../api.js';
import type { AccionAlarma, Alarma, ContextoAlarma, DesenlaceAlarma } from '../tipos.js';
import { ETIQUETA_DESENLACE, fraseParaEvento, MOTIVOS_CIERRE, RESULTADOS_LLAMADA, type ResultadoLlamada } from '@monitoring/shared';
import { fechaHora } from '../tiempo.js';
import { CLASES_TIPO, tipoDe } from '../ui.js';

/**
 * Piezas de la atención de una alarma que comparten la cola de escritorio y
 * la del teléfono: la lista de llamadas con registro del resultado, la
 * bitácora, y el cierre guiado. Viven aparte para que las dos pantallas hagan
 * exactamente lo mismo y no vuelva a pasar que desde el teléfono todo se
 * cierre como "resuelta".
 */

type Contacto = ContextoAlarma['contactos'][number];

/**
 * Lista de llamadas. Tocar el teléfono marca el intento; después se elige el
 * resultado, que queda en la bitácora. La palabra clave incorrecta es el caso
 * que importa: el servidor sube la prioridad y deja la advertencia de coacción.
 */
export function ListaLlamadas({ alarma, contactos, compacta = false }: { alarma: Alarma; contactos: Contacto[]; compacta?: boolean }) {
  const clienteConsultas = useQueryClient();
  const [enCurso, setEnCurso] = useState<{ contacto: Contacto; telefono: string } | null>(null);
  const registrar = useMutation({
    mutationFn: (resultado: ResultadoLlamada) =>
      registrarLlamada(alarma.id, {
        contactoId: enCurso!.contacto.id,
        nombre: enCurso!.contacto.nombre,
        telefono: enCurso!.telefono,
        resultado,
      }),
    onSuccess: () => {
      setEnCurso(null);
      void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
    },
  });
  const cerrada = alarma.estado === 'cerrada';

  if (contactos.length === 0) return <p className="text-tenue">Sin contactos cargados.</p>;

  return (
    <ol className="flex flex-col gap-1.5">
      {contactos.map((c) => {
        const activo = enCurso?.contacto.id === c.id;
        return (
          <li key={c.id} className={activo ? 'bg-superficie-2 -mx-1 px-1 py-1 rounded-sm' : ''}>
            <span className="font-datos text-tenue">{c.orden}.</span> <span className="font-semibold">{c.nombre}</span>
            {c.rol && <span className="text-tenue text-xs"> ({c.rol})</span>}{' '}
            <Telefono numero={c.telefono} deshabilitado={cerrada} alLlamar={() => setEnCurso({ contacto: c, telefono: c.telefono })} />
            {c.telefonoAlternativo && (
              <>
                {' · '}
                <Telefono
                  numero={c.telefonoAlternativo}
                  deshabilitado={cerrada}
                  alLlamar={() => setEnCurso({ contacto: c, telefono: c.telefonoAlternativo! })}
                />
              </>
            )}
            {c.palabraClave && <span className="text-tenue"> · clave: {c.palabraClave}</span>}
            {c.autorizadoCancelar && <span className="text-ok text-xs font-semibold"> · puede cancelar</span>}
            {activo && (
              <div className={`mt-1 flex flex-wrap gap-1 ${compacta ? '' : 'pl-4'}`}>
                {(Object.keys(RESULTADOS_LLAMADA) as ResultadoLlamada[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => registrar.mutate(r)}
                    disabled={registrar.isPending}
                    className={`rounded-sm border px-2 py-0.5 text-xs ${
                      r === 'clave_incorrecta'
                        ? 'border-prio1 text-prio1 hover:bg-prio1/15'
                        : r === 'atendio_ok'
                          ? 'border-ok text-ok hover:bg-ok/15'
                          : 'border-borde text-tenue hover:text-texto'
                    } disabled:opacity-50`}
                  >
                    {RESULTADOS_LLAMADA[r]}
                  </button>
                ))}
                <button onClick={() => setEnCurso(null)} className="text-xs text-tenue underline underline-offset-2 px-1">
                  cancelar
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Telefono({ numero, deshabilitado, alLlamar }: { numero: string; deshabilitado: boolean; alLlamar: () => void }) {
  return (
    <a
      href={`tel:${numero}`}
      onClick={() => {
        if (!deshabilitado) alLlamar();
      }}
      className="font-datos text-acento underline underline-offset-2"
      title="Llamar y registrar el resultado"
    >
      {numero}
    </a>
  );
}

const NOMBRE_ACCION: Record<AccionAlarma['tipo'], string> = {
  toma: 'Tomada',
  nota: 'Nota',
  cierre: 'Cerrada',
  sistema: 'Sistema',
  paso: 'Paso',
  llamada: 'Llamada',
};

/** Bitácora: lo humano con nombre, lo del sistema en gris; la coacción en rojo. */
export function Bitacora({ acciones }: { acciones: AccionAlarma[] | undefined }) {
  if (!acciones || acciones.length === 0) return <p className="text-tenue">Sin acciones todavía.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {acciones.map((a) => {
        const sistema = a.tipo === 'sistema';
        const coaccion = sistema && (a.detalle ?? '').startsWith('POSIBLE COACCIÓN');
        return (
          <li
            key={a.id}
            className={`border-l-2 pl-2.5 ${coaccion ? 'border-prio1' : sistema ? 'border-borde/60' : 'border-acento/60'}`}
          >
            <span className="font-datos text-xs text-tenue">{fechaHora(a.creadoEn)}</span>{' '}
            <span className={`font-semibold ${coaccion ? 'text-prio1' : sistema ? 'text-tenue' : ''}`}>{NOMBRE_ACCION[a.tipo]}</span>
            {a.operadorNombre && !sistema && <span className="text-tenue text-xs"> · {a.operadorNombre}</span>}
            {a.detalle && (
              <p className={coaccion ? 'text-prio1 font-semibold' : sistema ? 'text-tenue italic' : 'text-tenue'}>{a.detalle}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Cierre guiado: desenlace, motivo de una lista fija, y texto solo cuando el
 * motivo es "otro" o el operador quiere agregar algo. Lo fijo se puede contar;
 * lo libre queda para el detalle.
 */
export function FormularioCierre({
  alarma,
  lote,
  otrasDelSitio = [],
  alCerrar,
  compacto = false,
}: {
  /** La alarma que se cierra (modo normal) */
  alarma?: Alarma;
  /** Cierre en lote: ids de todas las alarmas seleccionadas; el mismo desenlace y motivo para todas */
  lote?: number[];
  /** Otras alarmas abiertas del mismo sitio: se ofrecen para cerrar en lote */
  otrasDelSitio?: number[];
  alCerrar?: () => void;
  compacto?: boolean;
}) {
  const clienteConsultas = useQueryClient();
  const [desenlace, setDesenlace] = useState<DesenlaceAlarma>('resuelta');
  const [motivo, setMotivo] = useState<string>('');
  const [texto, setTexto] = useState('');
  const [tambienLasOtras, setTambienLasOtras] = useState(false);
  const cerrar = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const cierre = { desenlace, motivo, resolucion: texto.trim() || undefined };
      if (lote) return cerrarLote(lote, cierre);
      if (!alarma) throw new Error('Nada que cerrar');
      return tambienLasOtras && otrasDelSitio.length > 0
        ? cerrarLote([alarma.id, ...otrasDelSitio], cierre)
        : cerrarAlarma(alarma.id, cierre);
    },
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
      if (alarma) void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
      alCerrar?.();
    },
  });
  const motivos = MOTIVOS_CIERRE[desenlace];
  const listo = Boolean(motivo) && (motivo !== 'otro' || texto.trim().length > 0);

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <div className="flex gap-1">
        {(Object.keys(ETIQUETA_DESENLACE) as DesenlaceAlarma[]).map((valor) => (
          <button
            key={valor}
            onClick={() => {
              setDesenlace(valor);
              setMotivo('');
            }}
            className={`flex-1 rounded-sm border px-2 py-1 text-xs ${
              desenlace === valor ? 'border-acento bg-acento/15 text-acento font-semibold' : 'border-borde text-tenue hover:text-texto'
            }`}
          >
            {ETIQUETA_DESENLACE[valor]}
          </button>
        ))}
      </div>
      <div className={`flex flex-col ${compacto ? 'gap-1' : 'gap-0.5'}`}>
        {motivos.map((m) => (
          <label key={m.clave} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name={`motivo-${alarma?.id ?? 'lote'}`} checked={motivo === m.clave} onChange={() => setMotivo(m.clave)} className="accent-[var(--color-acento)]" />
            <span className={motivo === m.clave ? '' : 'text-tenue'}>{m.etiqueta}</span>
          </label>
        ))}
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={motivo === 'otro' ? 'Detalle (obligatorio)' : 'Detalle (opcional)'}
        rows={2}
        className="shrink-0 bg-fondo border border-borde rounded-sm px-2.5 py-1.5 resize-none"
      />
      {!lote && otrasDelSitio.length > 0 && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={tambienLasOtras} onChange={(e) => setTambienLasOtras(e.target.checked)} className="accent-[var(--color-acento)]" />
          <span>
            Cerrar también las otras <span className="font-semibold">{otrasDelSitio.length}</span> abiertas de este sitio con el mismo cierre
          </span>
        </label>
      )}
      {cerrar.isError && <p className="text-prio1 text-xs">{(cerrar.error as Error).message}</p>}
      <button
        onClick={() => cerrar.mutate()}
        disabled={!listo || cerrar.isPending}
        className={`${compacto ? 'w-full py-2.5' : 'self-end px-3 py-1'} bg-prio1/15 hover:bg-prio1/25 border border-prio1 text-prio1 rounded-sm text-xs font-semibold disabled:opacity-40`}
      >
        {lote ? `Cerrar ${lote.length} alarmas` : 'Cerrar alarma'}
      </button>
    </div>
  );
}

/**
 * Últimas alarmas cerradas del mismo sitio, con cómo terminó cada una. Es lo
 * primero que conviene mirar antes de llamar: si las tres últimas fueron falsas
 * alarmas del mismo sensor, la llamada es otra.
 */
export function UltimasAlarmas({ previas }: { previas: ContextoAlarma['previas'] }) {
  if (previas.length === 0) return <p className="text-tenue text-xs">Sin alarmas anteriores en este sitio.</p>;
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {previas.map((p) => (
        <li key={p.id} className="text-tenue">
          <span className="font-datos">{fechaHora(p.creadoEn)}</span> <span className="text-texto">{p.codigo} {p.descripcion}</span>
          {p.desenlace && <span className={p.desenlace === 'falsa_alarma' ? 'text-prio2' : 'text-ok'}> · {ETIQUETA_DESENLACE[p.desenlace]}</span>}
          {p.resolucion && <span> · {p.resolucion}</span>}
          {p.operadorNombre && <span> · {p.operadorNombre}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Lo que transmitió el equipo, sin las pruebas periódicas: quién abrió y
 * cerró, a qué hora, qué averías hubo. Para una alarma de horario («no cerró»,
 * «apertura fuera de horario») responde la pregunta antes de llamar.
 *
 * Va en una caja con su propio desplazamiento, para que se pueda ir hacia
 * atrás sin perder de vista el resto de la alarma; al llegar al final se
 * piden más al servidor.
 */
const PASO_SENALES = 100;

export function UltimasSenales({ panelId }: { panelId: number }) {
  const [limite, setLimite] = useState(PASO_SENALES);
  const { data: eventos, isLoading, isFetching } = useQuery({
    queryKey: ['eventos', 'panel', panelId, 'recientes', limite],
    queryFn: () => listarEventosDePanel(panelId, limite),
    refetchInterval: 30_000,
    // Al pedir más, lo que ya se ve no desaparece mientras llega lo nuevo
    placeholderData: (anterior) => anterior,
  });
  if (isLoading) return <p className="text-tenue text-xs">Cargando…</p>;
  const todos = eventos ?? [];
  const visibles = todos.filter((e) => tipoDe(e) !== 'prueba');
  // Si el servidor devolvió el tope, puede haber más atrás
  const hayMas = todos.length >= limite;
  if (visibles.length === 0 && !hayMas) return <p className="text-tenue text-xs">Sin señales recientes.</p>;
  return (
    <div className="max-h-72 overflow-y-auto overscroll-contain border border-borde/60 rounded p-2">
      <ul className="flex flex-col gap-1 text-xs">
        {visibles.map((e) => {
          // La misma frase corta que recibe el cliente en el aviso ("Desarmado por
          // Pedro Salas", "Armado rápido"): en un teléfono la descripción técnica
          // completa ocupa tres líneas y repite el nombre
          const frase = fraseParaEvento({ ...e, eventoId: e.id, zonaDescripcion: e.zonaDescripcion ?? null }, { nombrarSitio: false });
          return (
            <li key={e.id} className="text-tenue">
              <span className="font-datos">{fechaHora(e.ocurridoEn)}</span>{' '}
              <span className={`font-datos font-semibold ${CLASES_TIPO[tipoDe(e)].texto}`}>{e.codigo}</span>{' '}
              <span className="text-texto">{frase?.cuerpo ?? e.descripcion}</span>
            </li>
          );
        })}
      </ul>
      {hayMas && (
        <button
          onClick={() => setLimite((l) => l + PASO_SENALES)}
          disabled={isFetching}
          className="mt-2 w-full text-xs text-acento border border-borde rounded py-1.5 disabled:opacity-50"
        >
          {isFetching ? 'Cargando…' : 'Cargar señales anteriores'}
        </button>
      )}
    </div>
  );
}
