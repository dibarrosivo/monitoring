import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { avisarHombreMuerto, verConfiguracion } from './api.js';
import { sonarAlarma } from './sonido.js';

/**
 * Hombre muerto: cada intervalo configurado, la consola exige confirmar
 * presencia. Sin respuesta a tiempo, se registra una alarma de sistema y el
 * aviso persiste hasta confirmar. El intervalo, el tiempo de respuesta y el
 * apagado se configuran desde el panel de administración (vista Usuarios).
 */
export function HombreMuerto() {
  const { data: config } = useQuery({
    queryKey: ['configuracion'],
    queryFn: verConfiguracion,
    refetchInterval: 60_000,
  });
  const hombreMuerto = config?.hombreMuerto;

  const [visible, setVisible] = useState(false);
  const [restante, setRestante] = useState(0);
  const [avisado, setAvisado] = useState(false);
  const cuentaRegresiva = useRef<ReturnType<typeof setInterval> | null>(null);

  const activo = hombreMuerto?.activo ?? false;
  const intervaloMin = hombreMuerto?.intervaloMin ?? 30;
  const respuestaSeg = hombreMuerto?.respuestaSeg ?? 90;

  useEffect(() => {
    if (!activo) {
      setVisible(false);
      return;
    }
    const disparador = setInterval(() => {
      setVisible(true);
      setRestante(respuestaSeg);
      setAvisado(false);
      sonarAlarma(3);
    }, intervaloMin * 60_000);
    return () => clearInterval(disparador);
  }, [activo, intervaloMin, respuestaSeg]);

  useEffect(() => {
    if (!visible) return;
    cuentaRegresiva.current = setInterval(() => {
      setRestante((r) => Math.max(0, r - 1));
    }, 1000);
    return () => {
      if (cuentaRegresiva.current) clearInterval(cuentaRegresiva.current);
    };
  }, [visible]);

  useEffect(() => {
    if (visible && restante === 0 && !avisado) {
      setAvisado(true);
      void avisarHombreMuerto().catch(() => {
        // sin conexión: el aviso persiste en pantalla igualmente
      });
    }
  }, [visible, restante, avisado]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-fondo/90 flex items-center justify-center p-6" role="alertdialog" aria-label="Control de presencia">
      <div className={`w-full max-w-sm bg-superficie border rounded-sm p-6 flex flex-col items-center gap-4 text-center ${restante === 0 ? 'border-prio1' : 'border-prio2'}`}>
        <h2 className="font-datos font-semibold tracking-[0.15em]">CONTROL DE PRESENCIA</h2>
        {restante > 0 ? (
          <>
            <p className="text-tenue text-sm">Confirme que está en servicio.</p>
            <p className={`font-datos text-5xl tabular-nums ${restante <= 15 ? 'text-prio1' : 'text-prio2'}`}>{restante}</p>
          </>
        ) : (
          <p className="text-prio1 text-sm font-semibold">
            Sin respuesta: se registró una alarma de sistema. Confirme para retomar el servicio.
          </p>
        )}
        <button
          onClick={() => setVisible(false)}
          className="w-full bg-acento/15 hover:bg-acento/25 border border-acento text-acento rounded-sm py-3 font-semibold"
        >
          Estoy en servicio
        </button>
      </div>
    </div>
  );
}
