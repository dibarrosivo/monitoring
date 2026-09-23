import { useEffect, useState } from 'react';
import { esNativo } from '../api.js';
import { estadoPush, reintentarPush, type EstadoPush } from './push.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cambiarEstadoUsuarioCliente,
  crearContactoCliente,
  crearUsuarioCliente,
  editarContactoCliente,
  eliminarContactoCliente,
  verContactosCliente,
  verUsuariosCliente,
} from '../api.js';
import type { ContactoApp, PanelResumenCliente, Usuario, UsuarioApp } from '../tipos.js';

const CAMPO = 'bg-fondo border border-borde rounded-lg px-3 py-2 text-sm w-full';
const BOTON = 'bg-acento/15 hover:bg-acento/25 border border-acento text-acento rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50';
const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';
const ROLES = ['Propietario', 'Encargado', 'Empleado', 'Familiar', 'Vecino', 'Vigilante', 'Otro'];

/**
 * Pestaña Cuenta: quién soy y, si soy el propietario, a quién dejo entrar a
 * la app y a quién llama la central. Lo que no es del propietario se lee
 * pero no se toca: la central sigue siendo quien decide quién es propietario
 * y cómo está configurado el equipo.
 */
export function CuentaCliente({ usuario, paneles, propietarioDe, alCambiarClave }: { usuario: Usuario; paneles: PanelResumenCliente[]; propietarioDe: number[]; alCambiarClave: () => void }) {
  const clientes = [...new Map(paneles.map((p) => [p.clienteId, p.clienteNombre])).entries()];
  const esPropietario = propietarioDe.length > 0;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <section className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-1">
        <h2 className="font-semibold text-lg">{usuario.nombre}</h2>
        <p className="text-tenue text-sm font-datos">{usuario.email}</p>
        <p className="text-sm">
          {clientes.map(([id, nombre]) => (
            <span key={id} className="inline-block mr-2">
              {nombre}
              {propietarioDe.includes(id) && <span className="ml-1 text-ok text-xs font-semibold uppercase">propietario</span>}
            </span>
          ))}
        </p>
        <button onClick={alCambiarClave} className={`${BOTON_MINI} self-start mt-1`}>
          Cambiar mi clave
        </button>
        <EstadoNotificaciones />
      </section>

      {esPropietario ? (
        <>
          <Personas clientes={clientes.filter(([id]) => propietarioDe.includes(id))} paneles={paneles} usuarioActual={usuario.id} />
          <ListaLlamadas clientes={clientes.filter(([id]) => propietarioDe.includes(id))} paneles={paneles} />
        </>
      ) : (
        <p className="text-tenue text-sm">
          Los usuarios de la app y la lista de llamadas los administra el propietario de la cuenta. Si necesita un cambio, pídaselo a esa persona o a
          la central.
        </p>
      )}
    </div>
  );
}

function Personas({ clientes, paneles, usuarioActual }: { clientes: [number, string][]; paneles: PanelResumenCliente[]; usuarioActual: number }) {
  const clienteConsultas = useQueryClient();
  const { data: usuarios } = useQuery({ queryKey: ['usuarios-app-cli'], queryFn: verUsuariosCliente });
  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['usuarios-app-cli'] });
  const [agregando, setAgregando] = useState(false);
  const [d, setD] = useState({ clienteId: clientes[0]?.[0] ?? 0, nombre: '', email: '', clave: '', sitioId: '' });
  const [error, setError] = useState<string | null>(null);
  const crear = useMutation({
    mutationFn: () => crearUsuarioCliente({ clienteId: d.clienteId, nombre: d.nombre, email: d.email, clave: d.clave, sitioId: d.sitioId ? Number(d.sitioId) : undefined }),
    onSuccess: () => {
      setAgregando(false);
      setD({ ...d, nombre: '', email: '', clave: '', sitioId: '' });
      setError(null);
      refrescar();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo agregar'),
  });
  const estado = useMutation({
    mutationFn: (u: UsuarioApp) => cambiarEstadoUsuarioCliente(u.id, { clienteId: u.clienteId, activo: !u.activo }),
    onSuccess: refrescar,
  });
  const sitios = [...new Map(paneles.filter((p) => p.clienteId === d.clienteId).map((p) => [p.sitioId, p.sitioNombre])).entries()];

  return (
    <section className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">Personas con acceso a la app</h2>
        <button onClick={() => setAgregando(!agregando)} className={BOTON_MINI}>
          {agregando ? 'Cancelar' : '+ Agregar persona'}
        </button>
      </div>
      <ul className="divide-y divide-borde/60 text-sm">
        {(usuarios ?? []).map((u) => (
          <li key={`${u.id}-${u.clienteId}`} className={`py-2 flex items-center gap-3 ${u.activo ? '' : 'opacity-50'}`}>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">
                {u.nombre}
                {u.propietario && <span className="ml-1.5 text-ok text-xs font-semibold uppercase">propietario</span>}
                {!u.activo && <span className="ml-1.5 text-prio2 text-xs font-semibold uppercase">sin acceso</span>}
              </span>
              <span className="block text-tenue text-xs font-datos truncate">
                {u.email}
                {clientes.length > 1 && ` · ${u.clienteNombre}`}
                {u.sitioNombre && ` · solo ${u.sitioNombre}`}
              </span>
            </span>
            {!u.propietario && u.id !== usuarioActual && (
              <button onClick={() => estado.mutate(u)} disabled={estado.isPending} className={u.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
                {u.activo ? 'Quitar acceso' : 'Devolver acceso'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {agregando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
          className="flex flex-col gap-2 border-t border-borde/60 pt-3"
        >
          {clientes.length > 1 && (
            <select value={d.clienteId} onChange={(e) => setD({ ...d, clienteId: Number(e.target.value), sitioId: '' })} className={CAMPO}>
              {clientes.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          )}
          <input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Nombre y apellido" required className={CAMPO} />
          <input value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} type="email" placeholder="Correo (será su usuario)" required className={CAMPO} />
          <input value={d.clave} onChange={(e) => setD({ ...d, clave: e.target.value })} type="password" placeholder="Clave inicial (mínimo 6)" required minLength={6} className={CAMPO} />
          {sitios.length > 1 && (
            <select value={d.sitioId} onChange={(e) => setD({ ...d, sitioId: e.target.value })} className={CAMPO}>
              <option value="">Puede ver todos los sitios</option>
              {sitios.map(([id, nombre]) => (
                <option key={id} value={id}>
                  Solo {nombre}
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-prio1 text-xs">{error}</p>}
          <button type="submit" disabled={crear.isPending} className={BOTON}>
            Dar acceso
          </button>
        </form>
      )}
    </section>
  );
}

function ListaLlamadas({ clientes, paneles }: { clientes: [number, string][]; paneles: PanelResumenCliente[] }) {
  const clienteConsultas = useQueryClient();
  const { data: contactos } = useQuery({ queryKey: ['contactos-cli'], queryFn: verContactosCliente });
  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['contactos-cli'] });
  const [editando, setEditando] = useState<Partial<ContactoApp> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: (c: Partial<ContactoApp>) =>
      c.id
        ? editarContactoCliente(c.id, { nombre: c.nombre, rol: c.rol ?? null, telefono: c.telefono, sitioId: c.sitioId ?? null })
        : crearContactoCliente({ clienteId: c.clienteId!, nombre: c.nombre!, rol: c.rol ?? null, telefono: c.telefono!, telefonoAlternativo: null, sitioId: c.sitioId ?? null, orden: (contactos?.filter((x) => x.clienteId === c.clienteId).length ?? 0) + 1 }),
    onSuccess: () => {
      setEditando(null);
      setError(null);
      refrescar();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar'),
  });
  const quitar = useMutation({ mutationFn: eliminarContactoCliente, onSuccess: refrescar });
  const nombreSitio = (id: number | null) => (id === null ? null : paneles.find((p) => p.sitioId === id)?.sitioNombre ?? null);

  return (
    <section className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">A quién llama la central</h2>
        <button onClick={() => setEditando({ clienteId: clientes[0]?.[0], nombre: '', telefono: '', rol: 'Encargado', sitioId: null })} className={BOTON_MINI}>
          + Agregar
        </button>
      </div>
      <p className="text-tenue text-xs">En este orden, cuando hay una alarma. Cada cambio queda registrado y la central lo ve.</p>
      <ol className="divide-y divide-borde/60 text-sm">
        {(contactos ?? []).map((c, i) => (
          <li key={c.id} className="py-2 flex items-center gap-3">
            <span className="font-datos text-tenue w-5 text-right">{i + 1}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">
                {c.nombre}
                {c.rol && <span className="text-tenue font-normal"> · {c.rol}</span>}
              </span>
              <span className="block text-tenue text-xs font-datos">
                {c.telefono}
                {nombreSitio(c.sitioId) && ` · ${nombreSitio(c.sitioId)}`}
              </span>
            </span>
            <button onClick={() => setEditando(c)} className={BOTON_MINI}>
              Editar
            </button>
            <button onClick={() => quitar.mutate(c.id)} className={BOTON_MINI_ROJO}>
              Quitar
            </button>
          </li>
        ))}
        {(contactos ?? []).length === 0 && <li className="py-2 text-tenue">Todavía no hay personas en la lista de llamadas.</li>}
      </ol>
      {editando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate(editando);
          }}
          className="flex flex-col gap-2 border-t border-borde/60 pt-3"
        >
          <input value={editando.nombre ?? ''} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Nombre y apellido" required className={CAMPO} />
          <input value={editando.telefono ?? ''} onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} placeholder="Teléfono" required inputMode="tel" className={`${CAMPO} font-datos`} />
          <select value={editando.rol ?? ''} onChange={(e) => setEditando({ ...editando, rol: e.target.value })} className={CAMPO}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {error && <p className="text-prio1 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(null)} className="text-tenue text-sm px-3">
              Cancelar
            </button>
            <button type="submit" disabled={guardar.isPending} className={`${BOTON} flex-1`}>
              {editando.id ? 'Guardar cambios' : 'Agregar a la lista'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const TEXTO_ESTADO: Record<EstadoPush['etapa'], string> = {
  'no-nativo': 'Este es el navegador: los avisos con la app cerrada solo llegan en la app instalada.',
  'sin-plugin': 'La app no pudo cargar el módulo de notificaciones.',
  'permiso-negado': 'Sin permiso de notificaciones. Actívelo en Ajustes del teléfono → Apps → Falcon Alarma → Notificaciones.',
  registrando: 'Registrando el teléfono en Firebase…',
  registrado: 'Este teléfono recibe avisos aunque la app esté cerrada.',
  error: 'No se pudo registrar el teléfono.',
};

/** Diagnóstico a la vista: si un teléfono no recibe avisos, acá dice por qué. */
function EstadoNotificaciones() {
  const [estado, setEstado] = useState<EstadoPush | null>(() => estadoPush());
  useEffect(() => {
    const alCambiar = (e: Event) => setEstado((e as CustomEvent<EstadoPush>).detail);
    window.addEventListener('push-estado', alCambiar);
    return () => window.removeEventListener('push-estado', alCambiar);
  }, []);
  if (!esNativo()) return null;
  const etapa = estado?.etapa ?? 'registrando';
  const bien = etapa === 'registrado';
  return (
    <div className="mt-2 border-t border-borde/60 pt-2 text-sm flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <span className={`led ${bien ? 'led-verde' : 'led-rojo'}`} aria-hidden />
        <span className="font-semibold">Avisos con la app cerrada</span>
      </span>
      <span className="text-tenue text-xs">{TEXTO_ESTADO[etapa]}</span>
      {estado?.detalle && etapa !== 'registrado' && <span className="text-prio2 text-xs font-datos break-all">{estado.detalle}</span>}
      {!bien && (
        <button onClick={() => void reintentarPush(() => undefined)} className={`${BOTON_MINI} self-start`}>
          Reintentar
        </button>
      )}
    </div>
  );
}
