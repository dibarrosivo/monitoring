import { useEffect, useRef, useState } from 'react';
import { tokenGuardado } from './api.js';
import type { MensajeTiempoReal } from './tipos.js';

/** Conexión WebSocket con reconexión automática. Devuelve el estado del enlace. */
export function useTiempoReal(alRecibir: (mensaje: MensajeTiempoReal) => void): 'conectado' | 'desconectado' {
  const [estado, setEstado] = useState<'conectado' | 'desconectado'>('desconectado');
  const referencia = useRef(alRecibir);
  referencia.current = alRecibir;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let cerrado = false;

    function conectar() {
      const token = tokenGuardado();
      if (!token) return;
      const protocolo = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocolo}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`);

      socket.onopen = () => setEstado('conectado');
      socket.onmessage = (evento) => {
        try {
          referencia.current(JSON.parse(evento.data as string) as MensajeTiempoReal);
        } catch {
          // mensaje ilegible: se ignora
        }
      };
      socket.onclose = () => {
        setEstado('desconectado');
        if (!cerrado) temporizador = setTimeout(conectar, 3000);
      };
      socket.onerror = () => socket?.close();
    }

    conectar();
    return () => {
      cerrado = true;
      if (temporizador) clearTimeout(temporizador);
      socket?.close();
    };
  }, []);

  return estado;
}
