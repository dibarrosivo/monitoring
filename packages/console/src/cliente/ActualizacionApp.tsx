import { useQuery } from '@tanstack/react-query';
import { esNativo, servidorGuardado } from '../api.js';

/**
 * Aviso de versión nueva para la app instalada por fuera de la tienda: se
 * compara la versión que corre con la publicada en /app/version.json y, si
 * hay una más nueva, se ofrece el enlace. Nada de esto aplica en la web.
 *
 * Solo existe en el canal directo. En el build que va a Google Play la
 * constante es false y el componente entero se cae del paquete, porque la
 * tienda prohíbe que una app suya se actualice bajando un APK por fuera.
 */

interface VersionPublicada {
  version: string;
  url: string;
  notas?: string;
}

/** ¿"1.2.0" es más nueva que "1.1.3"? Comparación por partes numéricas. */
export function esMasNueva(publicada: string, actual: string): boolean {
  const a = publicada.split('.').map(Number);
  const b = actual.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

function AvisoDeVersion() {
  const { data } = useQuery({
    queryKey: ['version-app'],
    queryFn: async (): Promise<VersionPublicada | null> => {
      const r = await fetch(`${servidorGuardado()}/app/version.json`, { cache: 'no-store' });
      return r.ok ? ((await r.json()) as VersionPublicada) : null;
    },
    enabled: esNativo(),
    staleTime: 60 * 60_000,
    retry: false,
  });

  if (!data || !esMasNueva(data.version, __VERSION_APP__)) return null;
  const url = data.url.startsWith('http') ? data.url : `${servidorGuardado()}${data.url}`;
  return (
    <div className="bg-acento/15 border-b border-acento px-4 py-2 text-sm flex items-center gap-3">
      <span>
        Hay una versión nueva de la app ({data.version}). Tiene la {__VERSION_APP__}.
      </span>
      <a href={url} className="ml-auto shrink-0 border border-acento text-acento rounded-sm px-3 py-1 font-semibold">
        Descargar
      </a>
    </div>
  );
}

/** En el build de Play no hay aviso de versión: la tienda se encarga. */
export const ActualizacionApp = __CANAL_DIRECTO__ ? AvisoDeVersion : () => null;
