import { useQuery } from '@tanstack/react-query';
import { verSenal } from './api.js';
import { fechaHora } from './tiempo.js';

/** El "Ver" de un evento: la trama cruda tal como llegó al receptor. */
export function ModalSenal({ senalId, alCerrar }: { senalId: number; alCerrar: () => void }) {
  const { data: senal, isLoading } = useQuery({ queryKey: ['senal', senalId], queryFn: () => verSenal(senalId) });

  return (
    <div
      className="fixed inset-0 z-50 bg-fondo/80 flex items-center justify-center p-6"
      onClick={alCerrar}
      role="dialog"
      aria-label="Señal cruda"
    >
      <div
        className="w-full max-w-2xl bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-tenue text-xs uppercase tracking-wider">Señal cruda #{senalId}</h2>
          <button onClick={alCerrar} className="text-tenue hover:text-texto" aria-label="Cerrar">
            ✕
          </button>
        </header>
        {isLoading && <p className="text-tenue text-sm">Cargando…</p>}
        {senal && (
          <>
            <div className="font-datos text-xs text-tenue flex flex-wrap gap-x-4">
              <span>fuente {senal.fuente}</span>
              {senal.remoto && <span>origen {senal.remoto}</span>}
              <span>recibida {fechaHora(senal.recibidaEn)}</span>
              <span className={senal.estadoParse === 'ok' ? 'text-ok' : 'text-prio2'}>parse {senal.estadoParse}</span>
            </div>
            <pre className="bg-fondo border border-borde rounded-sm p-3 font-datos text-sm whitespace-pre-wrap break-all">
              {senal.cruda.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}
            </pre>
            {senal.detalleError && <p className="text-prio2 text-sm">{senal.detalleError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
