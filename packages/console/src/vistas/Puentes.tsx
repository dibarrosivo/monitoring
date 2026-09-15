import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diarioPuente, editarPuente, listarPuentes } from '../api.js';
import type { LineaDiarioPuente, Puente } from '../tipos.js';
import { horaCorta, transcurrido } from '../tiempo.js';
import { NOMBRE_CATEGORIA, clasesPrioridad } from '../ui.js';
import { ModalSenal } from '../ModalSenal.js';

/**
 * La ventana del puente, vista desde la consola.
 *
 * El puente corre en la PC de la central como un servicio sin ventana. Lo que
 * el operador quiere ver es lo mismo que mostraba el programa viejo en su
 * consola negra: cada trama que entra por el receptor y que salió al servidor.
 * Acá se muestra eso, con una diferencia: al lado de cada trama va lo que el
 * servidor entendió de ella, así se ve de un vistazo si el receptor está vivo
 * y si lo que manda se interpreta.
 */
export function Puentes() {
  const { data: puentes, isLoading } = useQuery({ queryKey: ['puentes'], queryFn: listarPuentes, refetchInterval: 15_000 });
  const [elegido, setElegido] = useState<number | null>(null);

  // Sin elección explícita se muestra el primero: casi siempre hay uno solo
  useEffect(() => {
    if (elegido === null && puentes && puentes.length > 0) setElegido(puentes[0]!.id);
  }, [puentes, elegido]);

  if (isLoading) return <p className="text-tenue">Cargando puentes…</p>;
  if (!puentes || puentes.length === 0) {
    return (
      <div className="bg-superficie border border-borde rounded-sm p-6 text-tenue text-sm max-w-xl">
        <p className="font-semibold text-texto mb-1">Todavía no reportó ningún puente.</p>
        <p>
          El puente se da de alta solo con su primer envío. Si ya está instalado en la PC de la central, revise que el
          servicio esté corriendo y que el archivo .env tenga el servidor y el token correctos.
        </p>
      </div>
    );
  }

  const puente = puentes.find((p) => p.id === elegido) ?? puentes[0]!;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {puentes.map((p) => (
          <TarjetaPuente key={p.id} puente={p} activa={p.id === puente.id} alElegir={() => setElegido(p.id)} />
        ))}
      </div>
      <Diario puente={puente} />
    </div>
  );
}

function TarjetaPuente({ puente, activa, alElegir }: { puente: Puente; activa: boolean; alElegir: () => void }) {
  const clienteConsultas = useQueryClient();
  const alternar = useMutation({
    mutationFn: (supervisado: boolean) => editarPuente(puente.id, { supervisado }),
    onSuccess: () => void clienteConsultas.invalidateQueries({ queryKey: ['puentes'] }),
  });
  const caido = puente.silencioso;

  return (
    <button
      onClick={alElegir}
      className={`text-left bg-superficie border rounded-sm p-3 flex flex-col gap-1.5 ${
        activa ? 'border-acento' : 'border-borde hover:border-tenue'
      } ${caido ? 'border-prio1' : ''}`}
    >
      <span className="flex items-center gap-2">
        <span className={`led ${caido ? 'led-rojo' : 'led-verde'}`} aria-hidden />
        <span className="font-semibold">{puente.nombre}</span>
        <span className={`ml-auto text-xs font-semibold ${caido ? 'text-prio1' : 'text-ok'}`}>
          {caido ? 'SIN REPORTAR' : 'EN LÍNEA'}
        </span>
      </span>
      {puente.descripcion && <span className="text-sm text-tenue">{puente.descripcion}</span>}
      <span className="font-datos text-xs text-tenue flex flex-wrap gap-x-3 gap-y-0.5">
        <span>entrada {puente.fuente === 'serie' ? 'puerto serie' : puente.fuente === 'tcp' ? 'red' : '—'}</span>
        {puente.version && <span>v{puente.version}</span>}
        <span>{puente.tramasRecibidas} tramas desde el arranque</span>
        <span>latido cada {puente.intervaloLatidoSeg} s</span>
      </span>
      <span className="font-datos text-xs flex items-center gap-3">
        <span className={caido ? 'text-prio1' : 'text-tenue'}>
          {puente.ultimoLatidoEn ? `último latido ${transcurrido(puente.ultimoLatidoEn)}` : 'nunca reportó'}
        </span>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            alternar.mutate(!puente.supervisado);
          }}
          className="ml-auto text-tenue hover:text-acento underline underline-offset-2"
        >
          {puente.supervisado ? 'Dejar de supervisar' : 'Supervisar'}
        </span>
      </span>
    </button>
  );
}

/** El diario en vivo: una línea por trama, como la consola del programa viejo. */
function Diario({ puente }: { puente: Puente }) {
  const [senalVisible, setSenalVisible] = useState<number | null>(null);
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['diario-puente', puente.id],
    queryFn: () => diarioPuente(puente.id),
    refetchInterval: 5_000,
  });

  const resumen = data?.resumen;

  return (
    <section className="bg-superficie border border-borde rounded-sm flex flex-col min-h-0">
      <header className="px-3 py-2 border-b border-borde flex items-center gap-4 flex-wrap font-datos text-xs">
        <span className="uppercase tracking-wider text-tenue">Diario de {puente.nombre}</span>
        {resumen && (
          <>
            <span>
              <span className="text-texto">{resumen.ultimas24h}</span>
              <span className="text-tenue"> tramas en 24 h</span>
            </span>
            <span>
              <span className={resumen.sinInterpretar24h > 0 ? 'text-prio2' : 'text-texto'}>{resumen.sinInterpretar24h}</span>
              <span className="text-tenue"> sin interpretar</span>
            </span>
            <span className="text-tenue">
              última trama{' '}
              <span className="text-texto">{resumen.ultimaTramaEn ? transcurrido(resumen.ultimaTramaEn) : 'nunca'}</span>
            </span>
          </>
        )}
        <span className="ml-auto text-tenue">
          {dataUpdatedAt ? `actualizado ${horaCorta(new Date(dataUpdatedAt).toISOString())}` : ''}
        </span>
      </header>

      {isLoading ? (
        <p className="p-3 text-tenue text-sm">Cargando el diario…</p>
      ) : !data || data.senales.length === 0 ? (
        <p className="p-3 text-tenue text-sm">Este puente todavía no envió tramas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-datos">
            <thead>
              <tr className="text-left text-tenue text-xs uppercase tracking-wider border-b border-borde">
                <th className="px-3 py-1.5 font-medium">Hora</th>
                <th className="px-3 py-1.5 font-medium">Trama recibida</th>
                <th className="px-3 py-1.5 font-medium">Cuenta</th>
                <th className="px-3 py-1.5 font-medium">Interpretación</th>
                <th className="px-3 py-1.5 font-medium" aria-label="Detalle" />
              </tr>
            </thead>
            <tbody>
              {data.senales.map((linea) => (
                <Fila key={linea.id} linea={linea} alVer={() => setSenalVisible(linea.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {senalVisible !== null && <ModalSenal senalId={senalVisible} alCerrar={() => setSenalVisible(null)} />}
    </section>
  );
}

function Fila({ linea, alVer }: { linea: LineaDiarioPuente; alVer: () => void }) {
  const entendida = linea.estadoParse === 'ok' && linea.codigo;
  const clase = linea.prioridad ? clasesPrioridad(linea.prioridad).texto : 'text-texto';

  return (
    <tr className="border-b border-borde/50 last:border-0 hover:bg-superficie-2">
      <td className="px-3 py-1 text-tenue whitespace-nowrap">{horaCorta(linea.recibidaEn)}</td>
      <td className="px-3 py-1 whitespace-pre text-texto">{linea.cruda}</td>
      <td className="px-3 py-1 whitespace-nowrap">{linea.numeroCuenta ?? <span className="text-tenue">—</span>}</td>
      <td className="px-3 py-1">
        {entendida ? (
          <span className={clase}>
            <span className="text-tenue">{linea.codigo} · </span>
            {linea.categoria ? `${NOMBRE_CATEGORIA[linea.categoria]}: ` : ''}
            {linea.descripcion}
          </span>
        ) : linea.estadoParse === 'ignorada' ? (
          <span className="text-tenue">latido del receptor</span>
        ) : (
          <span className="text-prio2">sin interpretar{linea.detalleError ? `: ${linea.detalleError}` : ''}</span>
        )}
      </td>
      <td className="px-3 py-1 text-right">
        <button onClick={alVer} className="text-xs text-tenue hover:text-acento underline underline-offset-2">
          Ver
        </button>
      </td>
    </tr>
  );
}
