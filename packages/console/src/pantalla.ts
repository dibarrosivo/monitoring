import { useEffect, useState } from 'react';

/** true en pantallas angostas (teléfono): la interfaz cambia de disposición. */
export function usePantallaChica(): boolean {
  const [chica, setChica] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 767px)');
    const alCambiar = (e: MediaQueryListEvent) => setChica(e.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);
  return chica;
}
