import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarCatalogo } from './api.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';

/**
 * Campo de texto con sugerencias de lo ya cargado (marcas, modelos,
 * instaladores). Se puede escribir un valor nuevo: al guardar el equipo queda
 * incorporado al catálogo y aparece la próxima vez. Así se evita tener
 * "Bosch", "BOSCH" y "bosh" conviviendo, sin obligar a mantener listas a mano.
 */
export function CampoSugerido({
  etiqueta,
  tipo,
  value,
  onChange,
  className,
}: {
  etiqueta: string;
  tipo: 'marca' | 'modelo' | 'instalador';
  value: string;
  onChange: (valor: string) => void;
  className?: string;
}) {
  const idLista = useId();
  const { data: sugerencias } = useQuery({
    queryKey: ['catalogo', tipo],
    queryFn: () => listarCatalogo(tipo),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <label className="flex flex-col gap-1">
      <span className="text-tenue">{etiqueta}</span>
      <input
        list={idLista}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className={className ?? CAMPO}
      />
      <datalist id={idLista}>
        {(sugerencias ?? []).map((s) => (
          <option key={s.valor} value={s.valor} />
        ))}
      </datalist>
    </label>
  );
}
