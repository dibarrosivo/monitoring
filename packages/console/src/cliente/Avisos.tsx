import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { verPreferenciasCliente } from '../api.js';
import { PREFERENCIAS_POR_DEFECTO, quiereRecibir } from './preferencias.js';
import { useTiempoReal } from '../tiempoReal.js';
import type { MensajeTiempoReal } from '../tipos.js';
import { fraseParaEvento, type Frase, type Tono } from './frases.js';
import { guardarVoz, hablar, prepararVoz, vozActiva, vozDisponible } from './voz.js';
import { esNativo } from '../api.js';
import { IconoAlerta, IconoAltavoz, IconoCampana, IconoCandado, IconoCheck, IconoInfo } from './Iconos.js';

/**
 * El operador dentro de la app: escucha el canal en tiempo real y, ante cada
 * evento del usuario, hace tres cosas a la vez:
 *
 *  1. lo muestra como aviso emergente arriba de la pantalla,
 *  2. lo dice en voz alta si la voz está activada,
 *  3. lo manda como notificación del sistema si la app no está a la vista,
 *     para que suene aunque el teléfono esté bloqueado con la app abierta.
 *
 * Las alarmas se quedan hasta que el usuario las toca; el resto se va solo.
 */

interface Aviso extends Frase {
  id: number;
  recibidoEn: number;
}

const DURACION_MS = 8_000;

export function useAvisosCliente(opciones: { nombrarSitio: boolean }): {
  avisos: Aviso[];
  descartar: (id: number) => void;
  enlace: 'conectado' | 'desconectado';
  voz: boolean;
  alternarVoz: () => void;
  notificaciones: NotificationPermission | 'no-disponible';
  pedirNotificaciones: () => void;
} {
  const clienteConsultas = useQueryClient();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [voz, setVoz] = useState(() => vozActiva());
  const [notificaciones, setNotificaciones] = useState<NotificationPermission | 'no-disponible'>(() =>
    typeof Notification === 'undefined' ? 'no-disponible' : Notification.permission,
  );
  const nombrarSitio = useRef(opciones.nombrarSitio);
  nombrarSitio.current = opciones.nombrarSitio;
  // Lo que el usuario eligió recibir; emergencias y alarmas pasan igual
  const { data: preferencias } = useQuery({ queryKey: ['preferencias-cli'], queryFn: verPreferenciasCliente, staleTime: 60_000 });
  const prefsRef = useRef(preferencias ?? PREFERENCIAS_POR_DEFECTO);
  prefsRef.current = preferencias ?? PREFERENCIAS_POR_DEFECTO;
  const vozRef = useRef(voz);
  vozRef.current = voz;

  useEffect(() => prepararVoz(), []);

  const descartar = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const alRecibir = useCallback(
    (mensaje: MensajeTiempoReal) => {
      // Lo que se ve en pantalla se refresca al instante, sin esperar el sondeo
      void clienteConsultas.invalidateQueries({ queryKey: ['resumen-cli'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas-cli'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['eventos-cli'] });
      // La pantalla del panel vuelve a preguntar el estado: un armado se refleja al instante
      void clienteConsultas.invalidateQueries({ queryKey: ['estado-panel'] });
      if (mensaje.canal !== 'nuevo_evento') return;

      const frase = fraseParaEvento(mensaje.carga, { nombrarSitio: nombrarSitio.current });
      if (!frase) return;
      if (!quiereRecibir(prefsRef.current, { categoria: mensaje.carga.categoria, tono: frase.tono })) return;

      const aviso: Aviso = { ...frase, id: mensaje.carga.eventoId, recibidoEn: Date.now() };
      setAvisos((lista) => [aviso, ...lista.filter((a) => a.id !== aviso.id)].slice(0, 5));
      if (!frase.persistente) setTimeout(() => descartar(aviso.id), DURACION_MS);

      // En la app instalada y en segundo plano, Android ya lo dice y lo muestra (push nativo): acá no se duplica
      const nativoEnFondo = esNativo() && document.visibilityState !== 'visible';
      if (vozRef.current && !nativoEnFondo) hablar(frase.texto, { urgente: frase.tono === 'emergencia' });
      if (frase.tono === 'emergencia' || frase.tono === 'alarma') {
        if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
      }
      if (!nativoEnFondo) notificarSistema(frase);
    },
    [clienteConsultas, descartar],
  );

  const enlace = useTiempoReal(alRecibir);

  function alternarVoz() {
    const nueva = !voz;
    setVoz(nueva);
    guardarVoz(nueva);
    // Este toque es el permiso del navegador para reproducir audio: se aprovecha
    if (nueva) hablar('Voz activada');
  }

  function pedirNotificaciones() {
    if (typeof Notification === 'undefined') return;
    void Notification.requestPermission().then((permiso) => setNotificaciones(permiso));
  }

  return { avisos, descartar, enlace, voz, alternarVoz, notificaciones, pedirNotificaciones };
}

/** Notificación del sistema cuando la app no está a la vista: suena con el tono del teléfono. */
function notificarSistema(frase: Frase): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    const n = new Notification(frase.tono === 'emergencia' ? 'EMERGENCIA' : frase.tono === 'alarma' ? 'ALARMA' : 'Mi alarma', {
      body: frase.texto,
      tag: `aviso-${Date.now()}`,
      requireInteraction: frase.persistente,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // algunos navegadores solo permiten notificaciones desde un service worker
  }
}

const ESTILO: Record<Tono, string> = {
  emergencia: 'bg-prio1 text-white border-prio1',
  alarma: 'bg-prio1/20 text-prio1 border-prio1',
  aviso: 'bg-prio2/15 text-prio2 border-prio2',
  estado: 'bg-superficie-2 text-texto border-borde',
  bien: 'bg-ok/15 text-ok border-ok',
};

const ICONO: Record<Tono, (p: { className?: string }) => ReactElement> = {
  emergencia: IconoAlerta,
  alarma: IconoAlerta,
  aviso: IconoInfo,
  estado: IconoCandado,
  bien: IconoCheck,
};

/** Los avisos apilados arriba de la pantalla. */
export function AvisosCliente({ avisos, alDescartar }: { avisos: Aviso[]; alDescartar: (id: number) => void }) {
  if (avisos.length === 0) return null;
  return (
    <div className="fixed top-2 inset-x-2 md:left-auto md:right-4 md:w-96 z-40 flex flex-col gap-2" role="status" aria-live="polite">
      {avisos.map((a) => (
        <button
          key={a.id}
          onClick={() => alDescartar(a.id)}
          className={`text-left border rounded-lg px-4 py-3 shadow-lg flex items-start gap-3 ${ESTILO[a.tono]} ${
            a.tono === 'emergencia' ? 'alarma-nueva' : ''
          }`}
        >
          {(() => {
            const Icono = ICONO[a.tono];
            return <Icono className="w-6 h-6 shrink-0 mt-0.5" />;
          })()}
          <span className="flex-1">
            <span className="block font-semibold">{a.texto}</span>
            <span className="block text-xs opacity-70 mt-0.5">
              {new Date(a.recibidoEn).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
              {a.persistente ? ' · toque para cerrar' : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Interruptores de voz y notificaciones para el encabezado. */
export function ControlesAviso({
  voz,
  alternarVoz,
  notificaciones,
  pedirNotificaciones,
}: {
  voz: boolean;
  alternarVoz: () => void;
  notificaciones: NotificationPermission | 'no-disponible';
  pedirNotificaciones: () => void;
}) {
  return (
    <span className="flex items-center gap-2">
      {vozDisponible() && (
        <button
          onClick={alternarVoz}
          title={voz ? 'Apagar la voz' : 'Encender la voz: la app dice en voz alta lo que pasa'}
          aria-label={voz ? 'Apagar la voz' : 'Encender la voz'}
          className={`px-1 ${voz ? 'text-acento' : 'text-tenue opacity-60'}`}
        >
          <IconoAltavoz apagado={!voz} />
        </button>
      )}
      {notificaciones === 'default' && (
        <button
          onClick={pedirNotificaciones}
          title="Recibir notificaciones del sistema cuando la app no está a la vista"
          className="text-xs border border-borde rounded-sm px-2 py-1 text-tenue hover:text-texto flex items-center gap-1"
        >
          <IconoCampana className="w-4 h-4" /> Activar avisos
        </button>
      )}
    </span>
  );
}
