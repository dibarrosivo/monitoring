import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarEventos, listarSenales } from '../api.js';
import { fechaHora } from '../tiempo.js';
import { CLASES_TIPO, NOMBRE_TIPO_SENAL, nombreCuenta, tipoDe } from '../ui.js';
import { ModalSenal } from '../ModalSenal.js';
import type { Senal } from '../tipos.js';

/**
 * Dos solapas, como en toda central: "Eventos" (lo decodificado y clasificado)
 * y "Todas las señales" (el diario crudo COMPLETO del receptor: latidos,
 * tramas ignoradas, errores de parseo y cifradas incluidas).
 */
export function Eventos({ solapaInicial = 'eventos' }: { solapaInicial?: 'eventos' | 'senales' }) {
  const [solapa, setSolapa] = useState<'eventos' | 'senales'>(solapaInicial);
  const [senalVisible, setSenalVisible] = useState<number | null>(null);

  // La franja superior puede pedir abrir directo el diario de señales
  useEffect(() => setSolapa(solapaInicial), [solapaInicial]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        <BotonSolapa activa={solapa === 'eventos'} alElegir={() => setSolapa('eventos')}>
          Eventos
        </BotonSolapa>
        <BotonSolapa activa={solapa === 'senales'} alElegir={() => setSolapa('senales')}>
          Todas las señales
        </BotonSolapa>
      </div>

      {solapa === 'eventos' ? (
        <TablaEventos alVerSenal={setSenalVisible} />
      ) : (
        <TablaSenales alVerSenal={setSenalVisible} />
      )}

      {senalVisible !== null && <ModalSenal senalId={senalVisible} alCerrar={() => setSenalVisible(null)} />}
    </div>
  );
}

function BotonSolapa({ activa, alElegir, children }: { activa: boolean; alElegir: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={alElegir}
      className={`px-4 py-1.5 rounded-sm text-sm border ${
        activa ? 'bg-superficie-2 border-borde font-semibold' : 'border-transparent text-tenue hover:text-texto'
      }`}
    >
      {children}
    </button>
  );
}

function TablaEventos({ alVerSenal }: { alVerSenal: (id: number) => void }) {
  const { data: eventos, isLoading } = useQuery({
    queryKey: ['eventos'],
    queryFn: () => listarEventos(200),
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-tenue">Cargando eventos…</p>;

  return (
    <div className="bg-superficie border border-borde rounded-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-tenue text-xs uppercase tracking-wider border-b border-borde">
            <th className="px-3 py-2 font-medium">Hora</th>
            <th className="px-3 py-2 font-medium">Código</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Descripción</th>
            <th className="px-3 py-2 font-medium">Cuenta</th>
            <th className="px-3 py-2 font-medium">Usuario / Zona</th>
            <th className="px-3 py-2 font-medium" aria-label="Señal" />
          </tr>
        </thead>
        <tbody className="font-datos">
          {(eventos ?? []).map((evento) => (
            <tr key={evento.id} className="border-b border-borde/50 last:border-0">
              <td className="px-3 py-1.5 text-tenue whitespace-nowrap">{fechaHora(evento.ocurridoEn)}</td>
              <td className={`px-3 py-1.5 font-semibold ${CLASES_TIPO[tipoDe(evento)].texto}`}>{evento.codigo}</td>
              <td className="px-3 py-1.5 font-ui text-xs">
                <span className={`inline-flex items-center gap-1.5 ${CLASES_TIPO[tipoDe(evento)].texto}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${CLASES_TIPO[tipoDe(evento)].barra}`} aria-hidden />
                  {NOMBRE_TIPO_SENAL[tipoDe(evento)]}
                </span>
              </td>
              <td className="px-3 py-1.5 font-ui">{evento.descripcion}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                {nombreCuenta(evento.prefijo, evento.numeroCuenta)}
                {evento.clienteNombre && <span className="font-ui text-texto"> {evento.clienteNombre}</span>}
              </td>
              <td className="px-3 py-1.5 text-tenue">
                {evento.zona ?? '—'}
                {evento.zonaDescripcion && <span className="font-ui text-texto"> - {evento.zonaDescripcion}</span>}
              </td>
              <td className="px-3 py-1.5">
                {evento.senalId && (
                  <button
                    onClick={() => alVerSenal(evento.senalId!)}
                    className="text-tenue hover:text-acento text-xs underline underline-offset-2"
                  >
                    Ver
                  </button>
                )}
              </td>
            </tr>
          ))}
          {(eventos ?? []).length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-tenue font-ui">
                Sin eventos registrados todavía. Cuando un panel transmita, aparecerán aquí.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const ESTADO_PARSE: Record<string, { nombre: string; clase: string }> = {
  ok: { nombre: 'OK', clase: 'text-ok' },
  ignorada: { nombre: 'LATIDO/IGNORADA', clase: 'text-tenue' },
  error: { nombre: 'ERROR', clase: 'text-prio2' },
  cifrada: { nombre: 'CIFRADA', clase: 'text-prio2' },
};

/**
 * Qué es una trama que no es un evento, dicho en palabras: de quién viene el
 * latido, o qué sondeo de internet fue. Así la fila se entiende sin leer la
 * trama cruda.
 */
function queEs(senal: Senal): { etiqueta: string; descripcion: string; clase: string } | null {
  const detalle = senal.detalleError ?? '';
  if (/^escaneo/.test(detalle)) {
    const motivo = detalle.replace(/^escaneo de internet:?\s*/, '').replace(/^\(reclasificada\)$/, 'sondeo');
    return { etiqueta: 'ESCANEO', descripcion: `Sondeo de internet: ${motivo || 'tráfico ajeno'}. Descartado.`, clase: 'text-tenue' };
  }
  if (/^latido/.test(detalle)) {
    const quien =
      senal.fuente === 'surgard-tcp'
        ? 'Latido del OSM de EBS en la central: el enlace está vivo'
        : senal.fuente === 'pima-bridge'
          ? 'Latido del receptor PIMA: el enlace está vivo'
          : senal.numeroCuenta
            ? `Latido del panel ${nombreCuenta(senal.prefijo, senal.numeroCuenta)}: sigue en línea`
            : 'Latido de un panel: sigue en línea';
    return { etiqueta: 'LATIDO', descripcion: quien, clase: 'text-tenue' };
  }
  if (senal.estadoParse === 'ignorada') return { etiqueta: 'IGNORADA', descripcion: detalle, clase: 'text-tenue' };
  return null;
}

/** Latidos y escaneos de internet: existen, pero no son señales de nadie */
function esRuido(senal: Senal): boolean {
  return senal.estadoParse === 'ignorada' && /^(latido|escaneo)/.test(senal.detalleError ?? '');
}

function TablaSenales({ alVerSenal }: { alVerSenal: (id: number) => void }) {
  const { data: senales, isLoading } = useQuery({
    queryKey: ['senales'],
    queryFn: () => listarSenales(300),
    refetchInterval: 15_000,
  });
  const [verRuido, setVerRuido] = useState(false);

  if (isLoading) return <p className="text-tenue">Cargando señales…</p>;
  const ruido = (senales ?? []).filter(esRuido).length;
  const visibles = (senales ?? []).filter((s) => verRuido || !esRuido(s));

  return (
    <div className="flex flex-col gap-2">
    <label className="flex items-center gap-2 text-xs text-tenue font-ui self-start cursor-pointer">
      <input type="checkbox" checked={verRuido} onChange={(e) => setVerRuido(e.target.checked)} className="accent-[var(--color-acento)]" />
      Mostrar latidos y escaneos de internet ({ruido})
    </label>
    <div className="bg-superficie border border-borde rounded-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-tenue text-xs uppercase tracking-wider border-b border-borde">
            <th className="px-3 py-2 font-medium">Recibida</th>
            <th className="px-3 py-2 font-medium">Fuente</th>
            <th className="px-3 py-2 font-medium">Origen</th>
            <th className="px-3 py-2 font-medium">Cuenta</th>
            <th className="px-3 py-2 font-medium">Parse</th>
            <th className="px-3 py-2 font-medium">Trama</th>
          </tr>
        </thead>
        <tbody className="font-datos">
          {visibles.map((senal) => {
            const ruido = queEs(senal);
            const estado = ruido
              ? { nombre: ruido.etiqueta, clase: ruido.clase }
              : (ESTADO_PARSE[senal.estadoParse] ?? { nombre: senal.estadoParse, clase: 'text-tenue' });
            return (
              <tr key={senal.id} className="border-b border-borde/50 last:border-0">
                <td className="px-3 py-1.5 text-tenue whitespace-nowrap">{fechaHora(senal.recibidaEn)}</td>
                <td className="px-3 py-1.5 text-tenue">{senal.fuente}</td>
                <td className="px-3 py-1.5 text-tenue text-xs">{senal.remoto?.replace('::ffff:', '') ?? '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {nombreCuenta(senal.prefijo, senal.numeroCuenta)}
                  {senal.clienteNombre && <span className="font-ui text-texto"> {senal.clienteNombre}</span>}
                </td>
                <td className={`px-3 py-1.5 text-xs whitespace-nowrap ${estado.clase}`}>{estado.nombre}</td>
                <td className="px-3 py-1.5 max-w-md">
                  {ruido && <span className="block font-ui text-xs text-texto/80">{ruido.descripcion}</span>}
                  {senal.estadoParse === 'error' && senal.detalleError && <span className="block font-ui text-xs text-prio2">{senal.detalleError}</span>}
                  <button
                    onClick={() => alVerSenal(senal.id)}
                    className="block w-full text-left truncate text-tenue hover:text-acento text-xs"
                    title="Ver trama completa"
                  >
                    {senal.cruda.replace(/[\n\r]/g, ' ').trim()}
                  </button>
                </td>
              </tr>
            );
          })}
          {visibles.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-tenue font-ui">
                Sin señales recibidas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
