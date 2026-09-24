import { useEffect, useState } from 'react';
import { esNativo } from '../api.js';
import { IconoCheck, IconoFlecha } from './Iconos.js';
import { abrirInicioAutomatico, estadoPermisos, inicioAutomaticoMarcado, marcarInicioAutomatico, pedirBateria, type EstadoPermisos } from './permisos.js';
import { estadoPush, reintentarPush, type EstadoPush } from './push.js';

/**
 * Los tres permisos que hacen que los avisos lleguen siempre, en orden, con
 * un botón que abre la pantalla exacta y una marca verde cuando está hecho.
 * Aparece en el inicio hasta que todo esté en verde (o se descarte) y queda
 * siempre en Cuenta para volver a revisar.
 */
export function ConfiguracionAvisos({ compacta = false, alCompletar }: { compacta?: boolean; alCompletar?: () => void }) {
  const [permisos, setPermisos] = useState<EstadoPermisos | null>(null);
  const [push, setPush] = useState<EstadoPush | null>(() => estadoPush());
  const [inicioAuto, setInicioAuto] = useState(() => inicioAutomaticoMarcado());

  const refrescar = () => void estadoPermisos().then(setPermisos);
  useEffect(() => {
    refrescar();
    // Al volver de la pantalla de ajustes del sistema, se vuelve a preguntar
    const alVolver = () => {
      if (document.visibilityState === 'visible') refrescar();
    };
    document.addEventListener('visibilitychange', alVolver);
    const alPush = (e: Event) => setPush((e as CustomEvent<EstadoPush>).detail);
    window.addEventListener('push-estado', alPush);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('push-estado', alPush);
    };
  }, []);

  if (!esNativo() || !permisos) return null;

  const pasos: { clave: string; titulo: string; detalle: string; listo: boolean; accion: () => void; boton: string }[] = [
    {
      clave: 'notificaciones',
      titulo: 'Permitir notificaciones',
      detalle: 'Para que la app pueda avisarle.',
      listo: permisos.notificaciones && push?.etapa === 'registrado',
      accion: () => void reintentarPush(() => undefined),
      boton: 'Permitir',
    },
    {
      clave: 'bateria',
      titulo: 'Permitir en segundo plano',
      detalle: 'Sin ahorro de batería para esta app; si no, el teléfono la duerme y los avisos llegan tarde o mudos.',
      listo: permisos.bateriaSinRestriccion,
      accion: () => void pedirBateria(),
      boton: 'Permitir',
    },
  ];
  if (permisos.necesitaInicioAutomatico) {
    pasos.push({
      clave: 'inicio',
      titulo: `Activar inicio automático (${permisos.fabricante})`,
      detalle: 'Este teléfono cierra las apps que no tienen inicio automático. Active el interruptor de Falcón Alarma y vuelva.',
      listo: inicioAuto,
      accion: () => void abrirInicioAutomatico(),
      boton: 'Abrir ajuste',
    });
  }
  const todoListo = pasos.every((p) => p.listo);
  useEffect(() => {
    if (todoListo) alCompletar?.();
  }, [todoListo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (compacta && todoListo) return null;

  return (
    <section className={`bg-superficie border rounded-2xl p-4 flex flex-col gap-3 ${todoListo ? 'border-borde' : 'border-prio2/60'}`}>
      <div>
        <h3 className="font-bold text-base leading-tight">Para que los avisos lleguen siempre</h3>
        <p className="text-tenue text-sm">
          {todoListo ? 'Todo en orden en este teléfono.' : 'Tres permisos del teléfono, una sola vez. Se marcan en verde cuando están hechos.'}
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {pasos.map((p, i) => (
          <li key={p.clave} className="flex items-center gap-3">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-datos ${
                p.listo ? 'bg-ok/15 text-ok border border-ok' : 'border border-borde text-tenue'
              }`}
              aria-hidden
            >
              {p.listo ? <IconoCheck className="w-4 h-4" /> : i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-sm font-semibold ${p.listo ? 'text-tenue line-through' : ''}`}>{p.titulo}</span>
              {!p.listo && <span className="block text-tenue text-xs">{p.detalle}</span>}
            </span>
            {!p.listo && (
              <button
                onClick={p.accion}
                className="shrink-0 border border-acento text-acento rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1 hover:bg-acento/10"
              >
                {p.boton} <IconoFlecha className="w-3.5 h-3.5" />
              </button>
            )}
            {p.clave === 'inicio' && !p.listo && (
              <button onClick={() => { marcarInicioAutomatico(true); setInicioAuto(true); }} className="shrink-0 text-xs text-tenue underline underline-offset-2">
                Ya lo activé
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
