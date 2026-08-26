import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { cambiarClave, cerrarSesion, servidorGuardado, verAlarmas, verResumen, type UsuarioApp } from '../api.js';
import { Inicio } from './Inicio.js';
import { Eventos } from './Eventos.js';
import { Panico } from './Panico.js';

type Pestana = 'inicio' | 'eventos' | 'panico' | 'ajustes';

const PESTANAS: { clave: Pestana; nombre: string; icono: string }[] = [
  { clave: 'inicio', nombre: 'Inicio', icono: '🏠' },
  { clave: 'eventos', nombre: 'Eventos', icono: '📋' },
  { clave: 'panico', nombre: 'Pánico', icono: '🆘' },
  { clave: 'ajustes', nombre: 'Ajustes', icono: '⚙️' },
];

export function Principal({ usuario }: { usuario: UsuarioApp }) {
  const [pestana, setPestana] = useState<Pestana>('inicio');
  const { data: resumen } = useQuery({ queryKey: ['resumen'], queryFn: verResumen, refetchInterval: 30_000 });
  const { data: alarmas } = useQuery({ queryKey: ['alarmas'], queryFn: verAlarmas, refetchInterval: 20_000 });

  return (
    <div className="min-h-screen bg-fondo flex flex-col">
      <header className="px-4 py-3 border-b border-borde bg-superficie flex items-center gap-2">
        <span className="font-datos font-semibold tracking-[0.15em] text-sm">MI ALARMA</span>
        <span className="text-tenue text-sm truncate ml-auto">{usuario.nombre}</span>
      </header>

      {(alarmas ?? []).length > 0 && (
        <div className="bg-prio1/20 border-b border-prio1 px-4 py-2.5 text-sm">
          <span className="font-semibold text-prio1">
            {alarmas!.length === 1 ? 'Alarma en curso' : `${alarmas!.length} alarmas en curso`}
          </span>{' '}
          — la central la está atendiendo. {alarmas![0]!.descripcion}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {pestana === 'inicio' && <Inicio resumen={resumen} alarmas={alarmas ?? []} />}
        {pestana === 'eventos' && <Eventos />}
        {pestana === 'panico' && <Panico sitios={resumen?.paneles ?? []} />}
        {pestana === 'ajustes' && <Ajustes usuario={usuario} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-superficie border-t border-borde flex">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestana(p.clave)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs ${
              pestana === p.clave ? 'text-acento font-semibold' : 'text-tenue'
            } ${p.clave === 'panico' ? 'text-prio1' : ''}`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {p.icono}
            </span>
            {p.nombre}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Ajustes({ usuario }: { usuario: UsuarioApp }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const cambiar = useMutation({
    mutationFn: () => cambiarClave(actual, nueva),
    onSuccess: () => {
      setActual('');
      setNueva('');
      setMensaje('Clave cambiada');
    },
    onError: (err) => setMensaje(err instanceof Error ? err.message : 'No se pudo cambiar la clave'),
  });

  return (
    <div className="flex flex-col gap-4 text-sm">
      <section className="bg-superficie border border-borde rounded p-4 flex flex-col gap-1">
        <h2 className="text-tenue text-xs uppercase tracking-wider mb-1">Cuenta</h2>
        <p className="font-semibold">{usuario.nombre}</p>
        <p className="font-datos text-tenue">{usuario.email}</p>
        <p className="font-datos text-tenue text-xs mt-1">Servidor: {servidorGuardado() || 'este mismo origen'}</p>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMensaje(null);
          cambiar.mutate();
        }}
        className="bg-superficie border border-borde rounded p-4 flex flex-col gap-2.5"
      >
        <h2 className="text-tenue text-xs uppercase tracking-wider">Cambiar clave</h2>
        <input
          type="password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          placeholder="Clave actual"
          required
          autoComplete="current-password"
          className="bg-fondo border border-borde rounded px-3 py-2.5 font-datos"
        />
        <input
          type="password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Clave nueva (mín. 6)"
          required
          minLength={6}
          autoComplete="new-password"
          className="bg-fondo border border-borde rounded px-3 py-2.5 font-datos"
        />
        {mensaje && <p className={mensaje === 'Clave cambiada' ? 'text-ok' : 'text-prio1'}>{mensaje}</p>}
        <button
          type="submit"
          disabled={cambiar.isPending || nueva.length < 6}
          className="self-end bg-superficie-2 border border-borde rounded px-4 py-2 font-semibold disabled:opacity-50"
        >
          Cambiar
        </button>
      </form>

      <button
        onClick={cerrarSesion}
        className="bg-superficie border border-borde rounded py-3 text-prio1 font-semibold"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
