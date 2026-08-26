import { useQuery } from '@tanstack/react-query';
import { verEventos } from '../api.js';

const COLOR_CATEGORIA: Record<string, string> = {
  alarma: 'text-prio1',
  sistema: 'text-prio2',
  averia: 'text-prio2',
  apertura: 'text-acento',
  cierre: 'text-ok',
  restauracion: 'text-ok',
};

const NOMBRE_CATEGORIA: Record<string, string> = {
  alarma: 'Alarma',
  restauracion: 'Restauración',
  apertura: 'Apertura',
  cierre: 'Cierre',
  averia: 'Avería',
  anulacion: 'Anulación',
  cancelacion: 'Cancelación',
  sistema: 'Aviso',
  desconocido: 'Evento',
};

export function Eventos() {
  const { data: eventos, isLoading } = useQuery({ queryKey: ['eventos'], queryFn: verEventos, refetchInterval: 30_000 });

  if (isLoading) return <p className="text-tenue">Cargando…</p>;
  if ((eventos ?? []).length === 0) return <p className="text-tenue">Sin actividad registrada todavía.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {(eventos ?? []).map((evento) => (
        <li key={evento.id} className="bg-superficie border border-borde rounded p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`font-semibold ${COLOR_CATEGORIA[evento.categoria] ?? 'text-tenue'}`}>
              {NOMBRE_CATEGORIA[evento.categoria] ?? evento.categoria}
            </span>
            <span className="text-tenue ml-auto font-datos text-xs">
              {new Date(evento.ocurridoEn).toLocaleString('es', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="text-sm mt-0.5">{evento.descripcion}</p>
          {evento.zona && (
            <p className="font-datos text-xs text-tenue mt-0.5">
              zona {evento.zona}
              {evento.zonaDescripcion && ` - ${evento.zonaDescripcion}`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
