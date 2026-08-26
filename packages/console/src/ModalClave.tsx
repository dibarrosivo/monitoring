import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { cambiarClave } from './api.js';

export function ModalClave({ alCerrar }: { alCerrar: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cambiar = useMutation({
    mutationFn: () => cambiarClave(actual, nueva),
    onSuccess: () => {
      setMensaje(null);
      alCerrar();
    },
    onError: (err) => setMensaje(err instanceof Error ? err.message : 'No se pudo cambiar la clave'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-fondo/80 flex items-center justify-center p-6" onClick={alCerrar} role="dialog">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          cambiar.mutate();
        }}
        className="w-full max-w-xs bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3"
      >
        <h2 className="text-tenue text-xs uppercase tracking-wider">Cambiar clave</h2>
        <input
          type="password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          placeholder="Clave actual"
          required
          autoComplete="current-password"
          className="bg-fondo border border-borde rounded-sm px-3 py-2 text-sm font-datos"
        />
        <input
          type="password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Clave nueva (mín. 6)"
          required
          minLength={6}
          autoComplete="new-password"
          className="bg-fondo border border-borde rounded-sm px-3 py-2 text-sm font-datos"
        />
        {mensaje && <p className="text-prio1 text-sm">{mensaje}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={alCerrar} className="text-tenue hover:text-texto text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={cambiar.isPending || nueva.length < 6}
            className="bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            Cambiar
          </button>
        </div>
      </form>
    </div>
  );
}
