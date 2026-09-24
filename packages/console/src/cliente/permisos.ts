import { registerPlugin } from '@capacitor/core';
import { esNativo } from '../api.js';

/**
 * Puente al plugin nativo de permisos (ver PermisosPlugin.java). En el
 * navegador no existe: todo devuelve "no aplica".
 */
export interface EstadoPermisos {
  fabricante: string;
  modelo: string;
  /** Xiaomi, Huawei, Oppo, Vivo, Samsung: matan apps en segundo plano si no se las autoriza */
  necesitaInicioAutomatico: boolean;
  notificaciones: boolean;
  bateriaSinRestriccion: boolean;
}

interface PluginPermisos {
  estado(): Promise<EstadoPermisos>;
  pedirBateria(): Promise<void>;
  abrirInicioAutomatico(): Promise<{ abierto: string }>;
  abrirAjustesApp(): Promise<{ abierto: string }>;
}

const Permisos = registerPlugin<PluginPermisos>('Permisos');

export async function estadoPermisos(): Promise<EstadoPermisos | null> {
  if (!esNativo()) return null;
  try {
    return await Permisos.estado();
  } catch {
    return null;
  }
}
export const pedirBateria = () => Permisos.pedirBateria().catch(() => undefined);
export const abrirInicioAutomatico = () => Permisos.abrirInicioAutomatico().catch(() => undefined);
export const abrirAjustesApp = () => Permisos.abrirAjustesApp().catch(() => undefined);

const CLAVE_INICIO_AUTO = 'monitoring.inicioAutomaticoListo';
export function inicioAutomaticoMarcado(): boolean {
  try {
    return localStorage.getItem(CLAVE_INICIO_AUTO) === 'si';
  } catch {
    return false;
  }
}
export function marcarInicioAutomatico(listo: boolean): void {
  try {
    if (listo) localStorage.setItem(CLAVE_INICIO_AUTO, 'si');
    else localStorage.removeItem(CLAVE_INICIO_AUTO);
  } catch {
    // sin almacenamiento, se vuelve a preguntar
  }
}
