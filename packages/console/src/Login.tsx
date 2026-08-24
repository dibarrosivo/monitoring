import { useState } from 'react';
import { ingresar } from './api.js';
import type { Usuario } from './tipos.js';

export function Login({ alIngresar }: { alIngresar: (usuario: Usuario) => void }) {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      alIngresar(await ingresar(email, clave));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar');
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="min-h-screen bg-fondo flex items-center justify-center p-6">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm bg-superficie border border-borde rounded-lg p-8 flex flex-col gap-5"
      >
        <header className="flex items-center gap-3">
          <span className="led led-verde" aria-hidden />
          <div>
            <h1 className="font-datos font-semibold tracking-[0.25em] text-sm">CENTRAL DE MONITOREO</h1>
            <p className="text-tenue text-sm">Consola de operador</p>
          </div>
        </header>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-tenue">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-fondo border border-borde rounded px-3 py-2 font-datos text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-tenue">Clave</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="bg-fondo border border-borde rounded px-3 py-2 font-datos text-sm"
          />
        </label>

        {error && <p className="text-prio1 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="bg-superficie-2 hover:bg-borde border border-borde rounded px-3 py-2 font-semibold text-sm disabled:opacity-50"
        >
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
