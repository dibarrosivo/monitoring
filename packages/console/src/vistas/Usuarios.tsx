import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crearUsuario, editarUsuario, guardarHombreMuerto, listarUsuarios, verConfiguracion } from '../api.js';
import type { UsuarioAdmin } from '../tipos.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';
const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';

export function Usuarios({ usuarioActualId }: { usuarioActualId: number }) {
  const { data: usuarios, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: () => listarUsuarios() });

  if (isLoading) return <p className="text-tenue">Cargando usuarios…</p>;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <ConfigPresencia />
      <FormularioUsuario />
      <ul className="bg-superficie border border-borde rounded-sm">
        {(usuarios ?? []).map((usuario) => (
          <FilaUsuario key={usuario.id} usuario={usuario} esUsuarioActual={usuario.id === usuarioActualId} />
        ))}
      </ul>
    </div>
  );
}

/** Parámetros del control de presencia (hombre muerto) de toda la central. */
function ConfigPresencia() {
  const clienteConsultas = useQueryClient();
  const { data: config } = useQuery({ queryKey: ['configuracion'], queryFn: verConfiguracion });
  const [activo, setActivo] = useState(true);
  const [intervaloMin, setIntervaloMin] = useState('30');
  const [respuestaSeg, setRespuestaSeg] = useState('90');
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (config?.hombreMuerto) {
      setActivo(config.hombreMuerto.activo);
      setIntervaloMin(String(config.hombreMuerto.intervaloMin));
      setRespuestaSeg(String(config.hombreMuerto.respuestaSeg));
    }
  }, [config]);

  const guardar = useMutation({
    mutationFn: () =>
      guardarHombreMuerto({
        activo,
        intervaloMin: Number(intervaloMin),
        respuestaSeg: Number(respuestaSeg),
      }),
    onSuccess: () => {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
      void clienteConsultas.invalidateQueries({ queryKey: ['configuracion'] });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
      className="bg-superficie border border-borde rounded-sm p-4 flex flex-wrap gap-3 items-center"
    >
      <h2 className="w-full text-tenue text-xs uppercase tracking-wider">Control de presencia (hombre muerto)</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Activado
      </label>
      <label className={`flex items-center gap-1.5 text-sm ${activo ? 'text-texto' : 'text-tenue'}`}>
        cada
        <input
          type="number"
          min="1"
          max="480"
          value={intervaloMin}
          onChange={(e) => setIntervaloMin(e.target.value)}
          disabled={!activo}
          className={`${CAMPO} w-20 font-datos`}
        />
        min
      </label>
      <label className={`flex items-center gap-1.5 text-sm ${activo ? 'text-texto' : 'text-tenue'}`}>
        respuesta
        <input
          type="number"
          min="10"
          max="600"
          value={respuestaSeg}
          onChange={(e) => setRespuestaSeg(e.target.value)}
          disabled={!activo}
          className={`${CAMPO} w-20 font-datos`}
        />
        s
      </label>
      <button type="submit" disabled={guardar.isPending} className={BOTON}>
        Guardar
      </button>
      {guardado && <span className="text-ok text-sm">Guardado — aplica en las consolas en menos de un minuto</span>}
      {guardar.isError && <span className="text-prio1 text-sm">No se pudo guardar</span>}
    </form>
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
      {esUsuarioActual && <span className="text-ok text-xs">(usted)</span>}

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
            {usuario.rol !== 'cliente' && (
              <button
                onClick={() => editar.mutate({ rol: usuario.rol === 'admin' ? 'operador' : 'admin' })}
                className={BOTON_MINI}
              >
                Hacer {usuario.rol === 'admin' ? 'operador' : 'admin'}
              </button>
            )}
            <button onClick={() => editar.mutate({ activo: !usuario.activo })} className={usuario.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
              {usuario.activo ? 'Desactivar' : 'Reactivar'}
            </button>
          </>
        )}
      </span>
    </li>
  );
}
