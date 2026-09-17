import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cerrarAlarma, registrarLlamada } from '../api.js';
import type { AccionAlarma, Alarma, ContextoAlarma, DesenlaceAlarma } from '../tipos.js';
import { ETIQUETA_DESENLACE, MOTIVOS_CIERRE, RESULTADOS_LLAMADA, type ResultadoLlamada } from '../cierres.js';
import { fechaHora } from '../tiempo.js';

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
export function FormularioCierre({ alarma, alCerrar, compacto = false }: { alarma: Alarma; alCerrar?: () => void; compacto?: boolean }) {
  const clienteConsultas = useQueryClient();
  const [desenlace, setDesenlace] = useState<DesenlaceAlarma>('resuelta');
  const [motivo, setMotivo] = useState<string>('');
  const [texto, setTexto] = useState('');
  const cerrar = useMutation({
    mutationFn: () => cerrarAlarma(alarma.id, { desenlace, motivo, resolucion: texto.trim() || undefined }),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['acciones', alarma.id] });
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
            <input type="radio" name={`motivo-${alarma.id}`} checked={motivo === m.clave} onChange={() => setMotivo(m.clave)} className="accent-[var(--color-acento)]" />
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
      {cerrar.isError && <p className="text-prio1 text-xs">{(cerrar.error as Error).message}</p>}
      <button
        onClick={() => cerrar.mutate()}
        disabled={!listo || cerrar.isPending}
        className={`${compacto ? 'w-full py-2.5' : 'self-end px-3 py-1'} bg-prio1/15 hover:bg-prio1/25 border border-prio1 text-prio1 rounded-sm text-xs font-semibold disabled:opacity-40`}
      >
        Cerrar alarma
      </button>
    </div>
  );
}
