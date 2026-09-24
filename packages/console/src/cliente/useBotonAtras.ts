import { useEffect, useRef } from 'react';
import { App as AppNativa } from '@capacitor/app';
import { esNativo } from '../api.js';
import { decidirAtras, type AccionAtras } from './atras.js';

/**
 * Botón ATRÁS de Android. Sin esto, Android cierra la app de un toque desde
 * cualquier pantalla. El listener se registra una vez; el estado actual se
 * lee por referencia para no re-registrarlo en cada render. OJO: el objeto
 * del plugin nunca pasa por un await (ver push.ts).
 */
export function useBotonAtras(
  estado: { modalAbierto: boolean; panelAbierto: boolean; enInicio: boolean },
  alAccion: (accion: AccionAtras) => void,
): void {
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const accionRef = useRef(alAccion);
  accionRef.current = alAccion;

  useEffect(() => {
    if (!esNativo()) return;
    let quitar: (() => void) | undefined;
    AppNativa.addListener('backButton', () => {
      accionRef.current(decidirAtras(estadoRef.current));
    }).then((m) => {
      quitar = () => void m.remove();
    });
    return () => quitar?.();
  }, []);
}

/** Cierra la app de verdad: solo desde el diálogo de confirmación. */
export function salirDeLaApp(): void {
  if (!esNativo()) return;
  void AppNativa.exitApp();
}
