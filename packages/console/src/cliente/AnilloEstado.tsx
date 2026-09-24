import { IconoAlerta, IconoCandado, IconoCandadoAbierto } from './Iconos.js';

/**
 * El círculo de estado: un disco entero del color del estado con el candado
 * adentro. Nada a medio camino, para que no se lea como progreso: verde y
 * cerrado si está protegido, ámbar y abierto si está desarmado, rojo latiendo
 * en alarma, gris con candado tenue sin datos. El protegido respira apenas.
 */
export type EstadoAnillo = 'armado' | 'desarmado' | 'desconocido' | 'alarma';

const COLOR: Record<EstadoAnillo, string> = {
  armado: 'var(--color-ok)',
  desarmado: 'var(--color-prio2)',
  desconocido: 'var(--color-tenue)',
  alarma: 'var(--color-prio1)',
};

export function AnilloEstado({ estado, tamano = 84 }: { estado: EstadoAnillo; tamano?: number }) {
  const color = COLOR[estado];
  const Icono = estado === 'alarma' ? IconoAlerta : estado === 'armado' ? IconoCandado : IconoCandadoAbierto;
  return (
    <span
      className={`anillo anillo-${estado} inline-flex items-center justify-center shrink-0`}
      style={{ width: tamano, height: tamano, color, background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `3px solid ${color}` }}
      aria-hidden
    >
      <Icono className="w-[44%] h-[44%]" grueso={1.9} />
    </span>
  );
}
