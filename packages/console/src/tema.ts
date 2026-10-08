import { useEffect, useState } from 'react';
import { pintarBarrasDelSistema } from './cliente/permisos.js';

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
  sincronizarBarras();
}

const PREFIERE_CLARO = '(prefers-color-scheme: light)';

/** En la app, las barras del sistema quedan fuera del WebView: se les pasa el tema efectivo. */
function sincronizarBarras(): void {
  const raiz = document.documentElement;
  const elegido = raiz.dataset.theme;
  const oscuro = elegido ? elegido === 'dark' : !window.matchMedia?.(PREFIERE_CLARO).matches;
  const fondo = getComputedStyle(raiz).getPropertyValue('--color-superficie').trim();
  pintarBarrasDelSistema(oscuro, fondo || (oscuro ? '#0a1626' : '#ffffff'));
}

// Con «Según el sistema», seguir al teléfono cuando cambia de claro a oscuro
window.matchMedia?.(PREFIERE_CLARO).addEventListener?.('change', sincronizarBarras);

export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>(() => temaGuardado());
  useEffect(() => aplicarTema(tema), [tema]);
  return [tema, setTema];
}

export const NOMBRE_TEMA: Record<Tema, string> = { sistema: 'Según el sistema', claro: 'Claro', oscuro: 'Oscuro' };
