import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarEventos, listarSenales } from '../api.js';
import { fechaHora } from '../tiempo.js';
import { NOMBRE_CATEGORIA, textoCategoria } from '../ui.js';
import { ModalSenal } from '../ModalSenal.js';

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
            <th className="px-3 py-2 font-medium">Categoría</th>
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
              <td className={`px-3 py-1.5 font-semibold ${textoCategoria(evento.categoria, evento.prioridad)}`}>
                {evento.codigo}
              </td>
              <td className="px-3 py-1.5 font-ui text-tenue">{NOMBRE_CATEGORIA[evento.categoria]}</td>
              <td className="px-3 py-1.5 font-ui">{evento.descripcion}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                {evento.numeroCuenta ?? '—'}
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

function TablaSenales({ alVerSenal }: { alVerSenal: (id: number) => void }) {
  const { data: senales, isLoading } = useQuery({
    queryKey: ['senales'],
    queryFn: () => listarSenales(200),
    refetchInterval: 15_000,
  });

  if (isLoading) return <p className="text-tenue">Cargando señales…</p>;

  return (
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
          {(senales ?? []).map((senal) => {
            const estado = ESTADO_PARSE[senal.estadoParse] ?? { nombre: senal.estadoParse, clase: 'text-tenue' };
            return (
              <tr key={senal.id} className="border-b border-borde/50 last:border-0">
                <td className="px-3 py-1.5 text-tenue whitespace-nowrap">{fechaHora(senal.recibidaEn)}</td>
                <td className="px-3 py-1.5 text-tenue">{senal.fuente}</td>
                <td className="px-3 py-1.5 text-tenue text-xs">{senal.remoto?.replace('::ffff:', '') ?? '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {senal.numeroCuenta ?? '—'}
                  {senal.clienteNombre && <span className="font-ui text-texto"> {senal.clienteNombre}</span>}
                </td>
                <td className={`px-3 py-1.5 text-xs ${estado.clase}`}>{estado.nombre}</td>
                <td className="px-3 py-1.5 max-w-md">
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
          {(senales ?? []).length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-tenue font-ui">
                Sin señales recibidas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
