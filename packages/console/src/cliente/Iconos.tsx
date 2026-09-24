/**
 * Íconos de la app, en SVG de trazo: nítidos a cualquier tamaño y del color
 * del texto que los rodea. Nada de emojis, que cambian de forma según el
 * teléfono y no se pueden teñir.
 */
type Props = { className?: string; grueso?: number };
const base = (props: Props) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: props.grueso ?? 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: props.className,
  'aria-hidden': true,
});

export const IconoCasa = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10.5V20h13v-9.5" />
    <path d="M10 20v-5h4v5" />
  </svg>
);
export const IconoCampana = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);
export const IconoLista = (p: Props) => (
  <svg {...base(p)}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const IconoSos = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5" />
    <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);
export const IconoPersona = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);
export const IconoCandado = (p: Props) => (
  <svg {...base(p)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
export const IconoCandadoAbierto = (p: Props) => (
  <svg {...base(p)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" />
  </svg>
);
export const IconoAlerta = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path d="M12 9.5v4.5" />
    <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);
export const IconoCheck = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.6 2.6L16 9.5" />
  </svg>
);
export const IconoInfo = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);
export const IconoFlecha = (p: Props) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconoAltavoz = (p: Props & { apagado?: boolean }) => (
  <svg {...base(p)}>
    <path d="M4 10v4h3l5 4V6L7 10H4Z" />
    {p.apagado ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />}
  </svg>
);

/** Marca: silueta simple de halcón en trazo, el mismo peso que los íconos. */
export const MarcaFalcon = (p: Props) => (
  <svg {...base({ ...p, grueso: 1.7 })} viewBox="0 0 24 24">
    <path d="M3 13c3-1 5.5-3.5 7-7 1 2 1.5 4 1.5 5.5 2.5-1 5.5-1.5 9.5-1-2.5 1.5-4.5 3.5-5.5 6.5-1.5-.5-3-.5-4.5 0-.5 1.5-1.5 2.5-3 3 .5-1.5.5-3 0-4.5C6.5 15 4.5 14.5 3 13Z" />
  </svg>
);
