import { useState } from 'react';
import { guardarServidor, ingresar, servidorGuardado, type UsuarioApp } from '../api.js';

export function Ingreso({ alIngresar }: { alIngresar: (usuario: UsuarioApp) => void }) {
  const [servidor, setServidor] = useState(servidorGuardado());
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      guardarServidor(servidor.trim());
      alIngresar(await ingresar(email.trim(), clave));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar');
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="min-h-screen bg-fondo flex items-center justify-center p-6">
      <form onSubmit={enviar} className="w-full max-w-sm flex flex-col gap-4">
        <header className="text-center mb-2">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="font-datos font-semibold tracking-[0.2em]">MI ALARMA</h1>
          <p className="text-tenue text-sm">El estado de tu seguridad, en tu bolsillo</p>
        </header>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-tenue">Servidor de la central</span>
          <input
            type="url"
            placeholder="http://192.168.0.184:3000"
            value={servidor}
            onChange={(e) => setServidor(e.target.value)}
            className="bg-superficie border border-borde rounded px-3 py-2.5 font-datos text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-tenue">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-superficie border border-borde rounded px-3 py-2.5 text-sm"
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
            className="bg-superficie border border-borde rounded px-3 py-2.5 text-sm"
          />
        </label>

        {error && <p className="text-prio1 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="bg-acento/15 hover:bg-acento/25 border border-acento text-acento rounded py-3 font-semibold disabled:opacity-50"
        >
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
