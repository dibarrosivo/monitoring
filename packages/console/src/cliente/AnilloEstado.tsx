import { IconoAlerta, IconoCandado, IconoCandadoAbierto } from './Iconos.js';

/**
 * El anillo de estado: la firma visual de la app. Un solo vistazo dice si el
 * sitio está protegido. Armado: anillo entero con un brillo que respira.
 * Desarmado: anillo abierto (le falta un tramo). Sin datos: punteado. En
 * alarma: rojo y latiendo.
 */
export type EstadoAnillo = 'armado' | 'desarmado' | 'desconocido' | 'alarma';

const COLOR: Record<EstadoAnillo, string> = {
  armado: 'var(--color-ok)',
  desarmado: 'var(--color-prio2)',
  desconocido: 'var(--color-tenue)',
  alarma: 'var(--color-prio1)',
};

export function AnilloEstado({ estado, tamano = 84 }: { estado: EstadoAnillo; tamano?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const color = COLOR[estado];
  // Desarmado: el anillo abre un tramo de 70° arriba a la derecha
  const dash = estado === 'desarmado' ? `${c * 0.8} ${c * 0.2}` : estado === 'desconocido' ? '4 7' : `${c} 0`;
  const Icono = estado === 'alarma' ? IconoAlerta : estado === 'armado' ? IconoCandado : IconoCandadoAbierto;
  return (
    <span
      className={`anillo anillo-${estado} inline-flex items-center justify-center shrink-0`}
      style={{ width: tamano, height: tamano, color }}
      aria-hidden
    >
      <svg width={tamano} height={tamano} viewBox="0 0 100 100" className="absolute">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={dash}
          transform="rotate(-125 50 50)"
        />
      </svg>
      <Icono className="relative" grueso={1.8} />
    </span>
  );
}
