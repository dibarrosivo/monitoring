import { NOMBRE_TEMA, useTema, type Tema } from './tema.js';

const ORDEN: Tema[] = ['sistema', 'claro', 'oscuro'];
const ICONO: Record<Tema, string> = { sistema: '◐', claro: '☀', oscuro: '☾' };

/**
 * Selector de tema. Compacto: un botón que rota Sistema → Claro → Oscuro, con
 * el nombre al lado cuando hay lugar. La elección queda guardada.
 */
export function SelectorTema({ conNombre = false, className = '' }: { conNombre?: boolean; className?: string }) {
  const [tema, setTema] = useTema();
  const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length]!;
  return (
    <button
      type="button"
      onClick={() => setTema(siguiente)}
      title={`Tema: ${NOMBRE_TEMA[tema]}. Tocar para cambiar a ${NOMBRE_TEMA[siguiente].toLowerCase()}`}
      aria-label={`Tema ${NOMBRE_TEMA[tema]}`}
      className={`flex items-center gap-2 text-tenue hover:text-texto ${className}`}
    >
      <span className="text-base leading-none" aria-hidden>
        {ICONO[tema]}
      </span>
      {conNombre && <span>Tema: {NOMBRE_TEMA[tema]}</span>}
    </button>
  );
}
