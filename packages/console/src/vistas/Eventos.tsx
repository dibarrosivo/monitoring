import { useQuery } from '@tanstack/react-query';
import { listarEventos } from '../api.js';
import { fechaHora } from '../tiempo.js';
import { NOMBRE_CATEGORIA, textoCategoria } from '../ui.js';

export function Eventos() {
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
            <th className="px-3 py-2 font-medium">Zona</th>
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
              <td className="px-3 py-1.5">{evento.numeroCuenta ?? '—'}</td>
              <td className="px-3 py-1.5 text-tenue">{evento.zona ?? '—'}</td>
            </tr>
          ))}
          {(eventos ?? []).length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-tenue font-ui">
                Sin eventos registrados todavía. Cuando un panel transmita, van a aparecer acá.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
