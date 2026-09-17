import { useEffect, useState } from 'react';

/**
 * Tema de la interfaz: oscuro, claro o el del sistema. La elección se guarda
 * en el navegador y se aplica como data-theme en <html>; sin elección, manda
 * la preferencia del sistema (ver index.css).
 */
export type Tema = 'sistema' | 'claro' | 'oscuro';

const CLAVE = 'monitoring.tema';

export function temaGuardado(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (tema === 'sistema') delete raiz.dataset.theme;
  else raiz.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  try {
    if (tema === 'sistema') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, tema);
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
}

export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>(() => temaGuardado());
  useEffect(() => aplicarTema(tema), [tema]);
  return [tema, setTema];
}

export const NOMBRE_TEMA: Record<Tema, string> = { sistema: 'Según el sistema', claro: 'Claro', oscuro: 'Oscuro' };
