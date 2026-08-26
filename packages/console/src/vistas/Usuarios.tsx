import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crearUsuario, editarUsuario, listarUsuarios } from '../api.js';
import type { UsuarioAdmin } from '../tipos.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';
const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';

export function Usuarios({ usuarioActualId }: { usuarioActualId: number }) {
  const { data: usuarios, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios });

  if (isLoading) return <p className="text-tenue">Cargando usuarios…</p>;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <FormularioUsuario />
      <ul className="bg-superficie border border-borde rounded-sm">
        {(usuarios ?? []).map((usuario) => (
          <FilaUsuario key={usuario.id} usuario={usuario} esUsuarioActual={usuario.id === usuarioActualId} />
        ))}
      </ul>
    </div>
  );
}

function FormularioUsuario() {
  const clienteConsultas = useQueryClient();
  const [datos, setDatos] = useState({ nombre: '', email: '', clave: '', rol: 'operador' as 'admin' | 'operador' });
  const [error, setError] = useState<string | null>(null);
  const crear = useMutation({
    mutationFn: () => crearUsuario(datos),
    onSuccess: () => {
      setDatos({ nombre: '', email: '', clave: '', rol: 'operador' });
      setError(null);
      void clienteConsultas.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo crear'),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
      className="bg-superficie border border-borde rounded-sm p-4 flex flex-wrap gap-2 items-center"
    >
      <h2 className="w-full text-tenue text-xs uppercase tracking-wider">Nuevo operador</h2>
      <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} placeholder="Nombre" required className={CAMPO} />
      <input value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} type="email" placeholder="Email" required className={CAMPO} />
      <input
        value={datos.clave}
        onChange={(e) => setDatos({ ...datos, clave: e.target.value })}
        type="text"
        placeholder="Clave inicial (mín. 6)"
        required
        minLength={6}
        className={`${CAMPO} font-datos`}
      />
      <select value={datos.rol} onChange={(e) => setDatos({ ...datos, rol: e.target.value as 'admin' | 'operador' })} className={CAMPO}>
        <option value="operador">Operador</option>
        <option value="admin">Administrador</option>
      </select>
      <button type="submit" disabled={crear.isPending} className={BOTON}>
        Crear usuario
      </button>
      {error && <span className="text-prio1 text-xs">{error}</span>}
    </form>
  );
}

function FilaUsuario({ usuario, esUsuarioActual }: { usuario: UsuarioAdmin; esUsuarioActual: boolean }) {
  const clienteConsultas = useQueryClient();
  const [claveNueva, setClaveNueva] = useState<string | null>(null);
  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['usuarios'] });

  const editar = useMutation({
    mutationFn: (cambios: { activo?: boolean; rol?: 'admin' | 'operador'; clave?: string }) => editarUsuario(usuario.id, cambios),
    onSuccess: () => {
      setClaveNueva(null);
      refrescar();
    },
  });

  return (
    <li className={`px-4 py-2.5 border-b border-borde/50 last:border-0 flex flex-wrap gap-3 items-center text-sm ${usuario.activo ? '' : 'opacity-50'}`}>
      <span className="font-semibold">{usuario.nombre}</span>
      <span className="font-datos text-tenue">{usuario.email}</span>
      <span className={usuario.rol === 'admin' ? 'text-acento text-xs uppercase' : 'text-tenue text-xs uppercase'}>{usuario.rol}</span>
      {!usuario.activo && <span className="text-prio2 text-xs">INACTIVO</span>}
      {esUsuarioActual && <span className="text-ok text-xs">(vos)</span>}

      <span className="ml-auto flex gap-3 items-center">
        {claveNueva === null ? (
          <button onClick={() => setClaveNueva('')} className={BOTON_MINI}>
            Restablecer clave
          </button>
        ) : (
          <>
            <input
              value={claveNueva}
              onChange={(e) => setClaveNueva(e.target.value)}
              placeholder="Clave nueva"
              className={`${CAMPO} font-datos w-36`}
            />
            <button onClick={() => editar.mutate({ clave: claveNueva })} disabled={claveNueva.length < 6} className={BOTON_MINI}>
              Aplicar
            </button>
          </>
        )}
        {!esUsuarioActual && (
          <>
            <button
              onClick={() => editar.mutate({ rol: usuario.rol === 'admin' ? 'operador' : 'admin' })}
              className={BOTON_MINI}
            >
              Hacer {usuario.rol === 'admin' ? 'operador' : 'admin'}
            </button>
            <button onClick={() => editar.mutate({ activo: !usuario.activo })} className={usuario.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
              {usuario.activo ? 'Desactivar' : 'Reactivar'}
            </button>
          </>
        )}
      </span>
    </li>
  );
}
