import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { enviarPanico } from '../api.js';
import type { PanelResumenCliente } from '../tipos.js';

const MS_PRESION = 1500;

/** Botón de pánico: presión sostenida de 1,5 s. Llega como alarma de prioridad máxima. */
export function PanicoCliente({ sitios }: { sitios: PanelResumenCliente[] }) {
  const unicos = [...new Map(sitios.map((p) => [p.sitioId, { id: p.sitioId, nombre: p.sitioNombre }])).values()];
  const [sitioId, setSitioId] = useState<number | null>(unicos[0]?.id ?? null);
  const [progreso, setProgreso] = useState(0);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);

  const enviar = useMutation({ mutationFn: (id: number) => enviarPanico(id) });

  function empezar() {
    if (!sitioId || enviar.isPending || enviar.isSuccess) return;
    const inicio = Date.now();
    temporizador.current = setInterval(() => {
      const avance = (Date.now() - inicio) / MS_PRESION;
      setProgreso(Math.min(avance, 1));
      if (avance >= 1) {
        soltar();
        enviar.mutate(sitioId);
        if (navigator.vibrate) navigator.vibrate(400);
      }
    }, 50);
  }

  function soltar() {
    if (temporizador.current) clearInterval(temporizador.current);
    temporizador.current = null;
    setProgreso(0);
  }

  if (enviar.isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center px-6 py-16">
        <span className="text-5xl" aria-hidden>
          ✅
        </span>
        <h2 className="text-xl font-semibold text-ok">Pánico enviado</h2>
        <p className="text-tenue max-w-sm">
          La central lo recibió como alarma de máxima prioridad y ya lo está atendiendo. Si es posible, mantenga el teléfono
          cerca.
        </p>
        <button onClick={() => enviar.reset()} className="text-tenue underline underline-offset-2 text-sm mt-2">
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      {unicos.length > 1 && (
        <select
          value={sitioId ?? ''}
          onChange={(e) => setSitioId(Number(e.target.value))}
          className="bg-superficie border border-borde rounded px-3 py-2 text-sm"
        >
          {unicos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      )}

      <button
        onPointerDown={empezar}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        disabled={!sitioId || enviar.isPending}
        className="boton-panico relative w-52 h-52 rounded-full bg-prio1/20 border-4 border-prio1 text-prio1 font-bold text-2xl select-none touch-none disabled:opacity-40"
      >
        {enviar.isPending ? 'Enviando…' : progreso > 0 ? 'Mantenga…' : 'SOS'}
        {progreso > 0 && (
          <span
            className="absolute inset-0 rounded-full border-4 border-prio1"
            style={{ clipPath: `inset(${(1 - progreso) * 100}% 0 0 0)`, background: 'rgb(255 77 61 / 0.25)' }}
            aria-hidden
          />
        )}
      </button>

      <p className="text-tenue text-sm max-w-xs">
        Mantenga presionado el botón 1,5 segundos para enviar un pánico silencioso a la central de monitoreo.
      </p>
      {enviar.isError && <p className="text-prio1 text-sm">No se pudo enviar. Verifique su conexión e intente de nuevo.</p>}
      {unicos.length === 0 && <p className="text-prio2 text-sm">Su cuenta no tiene sitios asociados.</p>}
    </div>
  );
}
