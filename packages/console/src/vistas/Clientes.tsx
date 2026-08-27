import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  crearAcceso,
  crearCliente,
  crearContacto,
  crearPanel,
  crearSitio,
  crearUsuario,
  eliminarAcceso,
  listarAccesos,
  editarCliente,
  editarContacto,
  editarSitio,
  eliminarContacto,
  eliminarSitio,
  editarUsuario,
  impersonar,
  iniciarImpersonacion,
  listarClientes,
  listarPaneles,
  listarUsuarios,
  usuarioGuardado,
  verCliente,
} from '../api.js';
import type { Cliente, Contacto, EstadoPanel, Sitio } from '../tipos.js';
import { Modal } from '../Modal.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';
const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';

export function Clientes({
  clienteInicial = null,
  alAbrirDispositivo,
}: {
  clienteInicial?: number | null;
  alAbrirDispositivo: (panelId: number) => void;
}) {
  const { data: clientes, isLoading } = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
  const [seleccionado, setSeleccionado] = useState<number | null>(clienteInicial);

  // La búsqueda global puede pedir abrir un cliente puntual
  useEffect(() => {
    if (clienteInicial !== null) setSeleccionado(clienteInicial);
  }, [clienteInicial]);

  if (isLoading) return <p className="text-tenue">Cargando clientes…</p>;

  // Detalle a pantalla completa; la lista es una tabla con el resumen a simple vista
  if (seleccionado !== null) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => setSeleccionado(null)} className="self-start text-tenue hover:text-acento text-sm">
          ← Volver a la lista
        </button>
        <DetalleCliente clienteId={seleccionado} alAbrirDispositivo={alAbrirDispositivo} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <FormularioCliente />
      <div className="bg-superficie border border-borde rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-tenue text-xs uppercase tracking-wider border-b border-borde">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 font-medium text-right">Sitios</th>
              <th className="px-3 py-2 font-medium text-right">Dispositivos</th>
              <th className="px-3 py-2 font-medium">Salud</th>
              <th className="px-3 py-2 font-medium text-right">Alarmas abiertas</th>
              <th className="px-3 py-2 font-medium">Estatus</th>
            </tr>
          </thead>
          <tbody>
            {(clientes ?? []).map((c) => (
              <tr
                key={c.id}
                onClick={() => setSeleccionado(c.id)}
                className={`border-b border-borde/50 last:border-0 cursor-pointer hover:bg-superficie-2/60 ${
                  c.activo ? '' : 'opacity-50'
                }`}
              >
                <td className="px-3 py-1.5 font-semibold">{c.nombre}</td>
                <td className="px-3 py-1.5 font-datos text-tenue">{c.telefono ?? '—'}</td>
                <td className="px-3 py-1.5 font-datos text-right">{c.sitios}</td>
                <td className="px-3 py-1.5 font-datos text-right">{c.dispositivos}</td>
                <td className="px-3 py-1.5 text-xs font-semibold">
                  {c.dispositivos === 0 ? (
                    <span className="text-tenue">sin dispositivos</span>
                  ) : c.silenciosos > 0 ? (
                    <span className="text-prio1">
                      {c.silenciosos} silencioso{c.silenciosos > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-ok">OK</span>
                  )}
                </td>
                <td className={`px-3 py-1.5 font-datos text-right ${c.alarmasAbiertas > 0 ? 'text-prio1 font-semibold' : 'text-tenue'}`}>
                  {c.alarmasAbiertas}
                </td>
                <td className={`px-3 py-1.5 text-xs ${c.activo ? 'text-ok' : 'text-prio2'}`}>
                  {c.activo ? 'Activo' : 'Inactivo'}
                </td>
              </tr>
            ))}
            {(clientes ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-tenue">
                  Sin clientes cargados. Alta con el formulario de arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormularioCliente() {
  const clienteConsultas = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const crear = useMutation({
    mutationFn: () => crearCliente({ nombre, telefono: telefono || undefined }),
    onSuccess: () => {
      setNombre('');
      setTelefono('');
      void clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
      className="bg-superficie border border-borde rounded-sm p-3 flex flex-col gap-2"
    >
      <h2 className="text-tenue text-xs uppercase tracking-wider">Nuevo cliente</h2>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" required className={CAMPO} />
      <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" className={CAMPO} />
      <button type="submit" disabled={!nombre.trim() || crear.isPending} className={BOTON}>
        Crear cliente
      </button>
    </form>
  );
}

function DetalleCliente({ clienteId, alAbrirDispositivo }: { clienteId: number; alAbrirDispositivo: (panelId: number) => void }) {
  const clienteConsultas = useQueryClient();
  const { data: detalle } = useQuery({ queryKey: ['cliente', clienteId], queryFn: () => verCliente(clienteId) });
  const { data: paneles } = useQuery({ queryKey: ['paneles'], queryFn: listarPaneles });

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['cliente', clienteId] });
    void clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
  }

  if (!detalle) return <p className="text-tenue">Cargando…</p>;

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4">
      <EncabezadoCliente cliente={detalle} alCambiar={refrescar} />

      <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
        <h3 className="text-tenue text-xs uppercase tracking-wider">Sitios y paneles</h3>
        {detalle.sitios.map((sitio) => (
          <TarjetaSitio
            key={sitio.id}
            sitio={sitio}
            paneles={(paneles ?? []).filter((p) => p.sitioId === sitio.id)}
            alCambiar={refrescar}
            alAbrirDispositivo={alAbrirDispositivo}
          />
        ))}
        {detalle.sitios.length === 0 && <p className="text-sm text-tenue">Sin sitios. El panel se cuelga de un sitio.</p>}
        <FormularioSitio clienteId={clienteId} alCrear={refrescar} />
      </section>

      <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
        <h3 className="text-tenue text-xs uppercase tracking-wider">Lista de llamadas</h3>
        <ol className="text-sm flex flex-col gap-1.5">
          {detalle.contactos.map((contacto) => (
            <FilaContacto key={contacto.id} contacto={contacto} alCambiar={refrescar} />
          ))}
          {detalle.contactos.length === 0 && <li className="text-tenue">Sin contactos cargados.</li>}
        </ol>
        <FormularioContacto clienteId={clienteId} alCrear={refrescar} />
      </section>

      {usuarioGuardado()?.rol === 'admin' && (
        <UsuariosApp
          clienteId={clienteId}
          sitios={detalle.sitios}
          paneles={(paneles ?? []).filter((p) => detalle.sitios.some((s) => s.id === p.sitioId))}
        />
      )}
    </div>
  );
}

/** Cuentas de la app móvil con acceso a este cliente (solo administradores). */
function UsuariosApp({ clienteId, sitios, paneles }: { clienteId: number; sitios: Sitio[]; paneles: EstadoPanel[] }) {
  const clienteConsultas = useQueryClient();
  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-app', clienteId],
    queryFn: () => listarUsuarios(clienteId),
  });
  const [datos, setDatos] = useState({ nombre: '', email: '', clave: '' });
  const [error, setError] = useState<string | null>(null);
  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['usuarios-app', clienteId] });

  const crear = useMutation({
    mutationFn: () => crearUsuario({ ...datos, rol: 'cliente', clienteId }),
    onSuccess: () => {
      setDatos({ nombre: '', email: '', clave: '' });
      setError(null);
      refrescar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo crear'),
  });
  const alternar = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => editarUsuario(id, { activo }),
    onSuccess: refrescar,
  });
  const verComo = useMutation({
    mutationFn: (id: number) => impersonar(id),
    onSuccess: iniciarImpersonacion,
  });

  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
      <h3 className="text-tenue text-xs uppercase tracking-wider">Usuarios de la app móvil</h3>
      <ul className="text-sm flex flex-col gap-2">
        {(usuarios ?? []).map((u) => (
          <li key={u.id} className={`flex flex-col gap-1 ${u.activo ? '' : 'opacity-50'}`}>
            <div className="flex gap-3 items-center flex-wrap">
              <span className="font-semibold">{u.nombre}</span>
              <span className="font-datos text-tenue">{u.email}</span>
              {!u.activo && <span className="text-prio2 text-xs">INACTIVO</span>}
              {u.activo && (
                <button onClick={() => verComo.mutate(u.id)} disabled={verComo.isPending} className={BOTON_MINI}>
                  Ver como este usuario
                </button>
              )}
              <button
                onClick={() => alternar.mutate({ id: u.id, activo: !u.activo })}
                className={u.activo ? BOTON_MINI_ROJO : BOTON_MINI}
              >
                {u.activo ? 'Desactivar' : 'Reactivar'}
              </button>
            </div>
            <AccesosDeUsuario usuarioId={u.id} clienteId={clienteId} sitios={sitios} paneles={paneles} />
          </li>
        ))}
        {(usuarios ?? []).length === 0 && <li className="text-tenue">El cliente todavía no tiene acceso a la app.</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
        className="flex flex-wrap gap-2 items-center"
      >
        <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} placeholder="Nombre" required className={CAMPO} />
        <input value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} type="email" placeholder="Email" required className={CAMPO} />
        <input
          value={datos.clave}
          onChange={(e) => setDatos({ ...datos, clave: e.target.value })}
          placeholder="Clave inicial (mín. 6)"
          required
          minLength={6}
          className={`${CAMPO} font-datos`}
        />
        <button type="submit" disabled={crear.isPending} className={BOTON}>
          Dar acceso a la app
        </button>
        {error && <span className="text-prio1 text-xs">{error}</span>}
      </form>
    </section>
  );
}

function EncabezadoCliente({ cliente, alCambiar }: { cliente: Cliente; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const alternarActivo = useMutation({
    mutationFn: () => editarCliente(cliente.id, { activo: !cliente.activo }),
    onSuccess: alCambiar,
  });

  return (
    <header className="bg-superficie border border-borde rounded-sm p-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-lg">{cliente.nombre}</h2>
        {!cliente.activo && <span className="text-prio2 text-xs">INACTIVO</span>}
        <button onClick={() => setEditando(true)} className={BOTON_MINI} title="Editar cliente">
          ✎ Editar
        </button>
        <button onClick={() => alternarActivo.mutate()} className={cliente.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
          {cliente.activo ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>
      <p className="text-sm text-tenue">
        {[cliente.telefono, cliente.email, cliente.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
      </p>
      {cliente.instrucciones ? (
        <p className="text-sm mt-2 whitespace-pre-wrap border-l-2 border-prio2 pl-2">
          <span className="text-prio2 text-xs uppercase tracking-wider block">Plan de acción</span>
          {cliente.instrucciones}
        </p>
      ) : (
        <p className="text-sm text-tenue mt-1">Sin plan de acción cargado (se muestra al operador ante cada alarma).</p>
      )}
      {editando && <ModalEditarCliente cliente={cliente} alCerrar={() => setEditando(false)} alCambiar={alCambiar} />}
    </header>
  );
}

/** Edición completa del cliente en un solo formulario (un solo PUT). */
function ModalEditarCliente({ cliente, alCerrar, alCambiar }: { cliente: Cliente; alCerrar: () => void; alCambiar: () => void }) {
  const [datos, setDatos] = useState({
    nombre: cliente.nombre,
    telefono: cliente.telefono ?? '',
    email: cliente.email ?? '',
    direccion: cliente.direccion ?? '',
    instrucciones: cliente.instrucciones ?? '',
    notas: cliente.notas ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () =>
      editarCliente(cliente.id, {
        nombre: datos.nombre,
        telefono: datos.telefono || undefined,
        email: datos.email || undefined,
        direccion: datos.direccion || undefined,
        instrucciones: datos.instrucciones || undefined,
        notas: datos.notas || undefined,
      }),
    onSuccess: () => {
      alCambiar();
      alCerrar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo guardar'),
  });

  return (
    <Modal titulo={`Editar cliente — ${cliente.nombre}`} alCerrar={alCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Nombre</span>
          <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} required className={CAMPO} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Teléfono</span>
            <input value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} className={CAMPO} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Email</span>
            <input type="email" value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} className={CAMPO} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Dirección</span>
          <input value={datos.direccion} onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Plan de acción (se muestra al operador ante cada alarma)</span>
          <textarea
            value={datos.instrucciones}
            onChange={(e) => setDatos({ ...datos, instrucciones: e.target.value })}
            rows={3}
            className={`${CAMPO} resize-none`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Notas internas</span>
          <textarea value={datos.notas} onChange={(e) => setDatos({ ...datos, notas: e.target.value })} rows={2} className={`${CAMPO} resize-none`} />
        </label>
        {error && <p className="text-prio1">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCerrar} className="text-tenue hover:text-texto">
            Cancelar
          </button>
          <button type="submit" disabled={guardar.isPending} className={BOTON}>
            Guardar cambios
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TarjetaSitio({
  sitio,
  paneles,
  alCambiar,
  alAbrirDispositivo,
}: {
  sitio: Sitio;
  paneles: EstadoPanel[];
  alCambiar: () => void;
  alAbrirDispositivo: (panelId: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const borrar = useMutation({
    mutationFn: () => eliminarSitio(sitio.id),
    onSuccess: alCambiar,
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo eliminar'),
  });

  return (
    <div className="border border-borde rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{sitio.nombre}</span>
        {sitio.direccion && <span className="text-tenue text-sm">{sitio.direccion}</span>}
        <button onClick={() => setEditando(true)} className={BOTON_MINI} title="Editar sitio">
          ✎ Editar
        </button>
        {paneles.length === 0 && (
          <button onClick={() => borrar.mutate()} className={BOTON_MINI_ROJO}>
            Eliminar
          </button>
        )}
        {error && <span className="text-prio1 text-xs">{error}</span>}
      </div>

      {paneles.map((panel) => (
        <button
          key={panel.id}
          onClick={() => alAbrirDispositivo(panel.id)}
          className={`flex items-center gap-3 border border-borde/60 rounded-sm p-2.5 text-left text-sm hover:border-acento ${
            panel.activo ? '' : 'opacity-60'
          }`}
        >
          <span className="font-datos font-semibold">cuenta {panel.numeroCuenta}</span>
          <span className="text-tenue">
            {[panel.tipo, panel.marca, panel.modelo].filter(Boolean).join(' · ')}
            {!panel.activo && ' · INACTIVO'}
          </span>
          <span className="ml-auto text-acento text-xs">Abrir dispositivo →</span>
        </button>
      ))}
      <FormularioPanel sitioId={sitio.id} alCrear={alCambiar} />
      {editando && <ModalEditarSitio sitio={sitio} alCerrar={() => setEditando(false)} alCambiar={alCambiar} />}
    </div>
  );
}

function ModalEditarSitio({ sitio, alCerrar, alCambiar }: { sitio: Sitio; alCerrar: () => void; alCambiar: () => void }) {
  const [nombre, setNombre] = useState(sitio.nombre);
  const [direccion, setDireccion] = useState(sitio.direccion ?? '');
  const guardar = useMutation({
    mutationFn: () => editarSitio(sitio.id, { nombre, direccion: direccion || undefined }),
    onSuccess: () => {
      alCambiar();
      alCerrar();
    },
  });

  return (
    <Modal titulo={`Editar sitio — ${sitio.nombre}`} alCerrar={alCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Dirección</span>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={CAMPO} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCerrar} className="text-tenue hover:text-texto">
            Cancelar
          </button>
          <button type="submit" disabled={guardar.isPending} className={BOTON}>
            Guardar cambios
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FilaContacto({ contacto, alCambiar }: { contacto: Contacto; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState({
    nombre: contacto.nombre,
    telefono: contacto.telefono,
    orden: String(contacto.orden),
    palabraClave: contacto.palabraClave ?? '',
  });
  const guardar = useMutation({
    mutationFn: () =>
      editarContacto(contacto.id, {
        nombre: datos.nombre,
        telefono: datos.telefono,
        orden: Number(datos.orden) || 1,
        palabraClave: datos.palabraClave || undefined,
      }),
    onSuccess: () => {
      setEditando(false);
      alCambiar();
    },
  });
  const borrar = useMutation({ mutationFn: () => eliminarContacto(contacto.id), onSuccess: alCambiar });

  if (editando) {
    return (
      <li className="flex flex-wrap gap-1.5 items-center">
        <input value={datos.orden} onChange={(e) => setDatos({ ...datos, orden: e.target.value })} type="number" min="1" className={`${CAMPO} w-16`} />
        <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} className={CAMPO} />
        <input value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} className={CAMPO} />
        <input value={datos.palabraClave} onChange={(e) => setDatos({ ...datos, palabraClave: e.target.value })} placeholder="Palabra clave" className={CAMPO} />
        <button onClick={() => guardar.mutate()} className={BOTON_MINI}>
          Guardar
        </button>
        <button onClick={() => setEditando(false)} className={BOTON_MINI}>
          Cancelar
        </button>
      </li>
    );
  }
  return (
    <li className="flex gap-2 items-center">
      <span className="font-datos text-tenue">{contacto.orden}.</span>
      <span className="font-semibold">{contacto.nombre}</span>
      <span className="font-datos text-acento">{contacto.telefono}</span>
      {contacto.palabraClave && <span className="text-tenue">clave: {contacto.palabraClave}</span>}
      <button onClick={() => setEditando(true)} className={BOTON_MINI}>
        Editar
      </button>
      <button onClick={() => borrar.mutate()} className={BOTON_MINI_ROJO}>
        Eliminar
      </button>
    </li>
  );
}

/** Los alcances de un usuario sobre este cliente: todo, un sitio o un panel. */
function AccesosDeUsuario({
  usuarioId,
  clienteId,
  sitios,
  paneles,
}: {
  usuarioId: number;
  clienteId: number;
  sitios: Sitio[];
  paneles: EstadoPanel[];
}) {
  const clienteConsultas = useQueryClient();
  const { data: accesos } = useQuery({
    queryKey: ['accesos', usuarioId],
    queryFn: () => listarAccesos(usuarioId),
  });
  const [alcance, setAlcance] = useState('cliente');

  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['accesos', usuarioId] });
  const agregar = useMutation({
    mutationFn: () => {
      const [tipo, id] = alcance.split(':');
      return crearAcceso({
        usuarioId,
        clienteId,
        sitioId: tipo === 'sitio' ? Number(id) : undefined,
        panelId: tipo === 'panel' ? Number(id) : undefined,
      });
    },
    onSuccess: refrescar,
  });
  const quitar = useMutation({ mutationFn: eliminarAcceso, onSuccess: refrescar });

  const deEsteCliente = (accesos ?? []).filter((a) => a.clienteId === clienteId);

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-2 border-l-2 border-borde">
      {deEsteCliente.map((a) => (
        <span key={a.id} className="flex items-center gap-1 bg-superficie-2 border border-borde rounded-sm px-2 py-0.5 text-xs">
          {a.panelId ? (
            <span className="font-datos">panel {a.panelCuenta}</span>
          ) : a.sitioId ? (
            <>sitio {a.sitioNombre}</>
          ) : (
            'todo el cliente'
          )}
          <button onClick={() => quitar.mutate(a.id)} className="text-tenue hover:text-prio1" aria-label="Quitar acceso">
            ✕
          </button>
        </span>
      ))}
      {deEsteCliente.length === 0 && <span className="text-prio2 text-xs">Sin accesos sobre este cliente</span>}
      <select value={alcance} onChange={(e) => setAlcance(e.target.value)} className={`${CAMPO} text-xs py-0.5`}>
        <option value="cliente">todo el cliente</option>
        {sitios.map((s) => (
          <option key={s.id} value={`sitio:${s.id}`}>
            sitio: {s.nombre}
          </option>
        ))}
        {paneles.map((p) => (
          <option key={p.id} value={`panel:${p.id}`}>
            panel: cuenta {p.numeroCuenta}
          </option>
        ))}
      </select>
      <button onClick={() => agregar.mutate()} disabled={agregar.isPending} className={BOTON_MINI}>
        Dar acceso
      </button>
    </div>
  );
}

function FormularioSitio({ clienteId, alCrear }: { clienteId: number; alCrear: () => void }) {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const crear = useMutation({
    mutationFn: () => crearSitio({ clienteId, nombre, direccion: direccion || undefined }),
    onSuccess: () => {
      setNombre('');
      setDireccion('');
      alCrear();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
      className="flex flex-wrap gap-2 items-center"
    >
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nuevo sitio" required className={CAMPO} />
      <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección" className={CAMPO} />
      <button type="submit" disabled={!nombre.trim() || crear.isPending} className={BOTON}>
        Agregar sitio
      </button>
    </form>
  );
}

function FormularioPanel({ sitioId, alCrear }: { sitioId: number; alCrear: () => void }) {
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [tipo, setTipo] = useState<'hikvision' | 'pima' | 'ebm' | 'otro'>('hikvision');
  const [error, setError] = useState<string | null>(null);
  const crear = useMutation({
    mutationFn: () => crearPanel({ sitioId, numeroCuenta, tipo }),
    onSuccess: () => {
      setNumeroCuenta('');
      setError(null);
      alCrear();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo crear el panel'),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
      className="flex flex-wrap gap-2 items-center"
    >
      <input
        value={numeroCuenta}
        onChange={(e) => setNumeroCuenta(e.target.value)}
        placeholder="Cuenta (hex, 3-16)"
        required
        pattern="[0-9A-Fa-f]{3,16}"
        className={`${CAMPO} font-datos w-40`}
      />
      <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={CAMPO}>
        <option value="hikvision">Hikvision</option>
        <option value="ebm">EBM</option>
        <option value="pima">PIMA</option>
        <option value="otro">Otro</option>
      </select>
      <button type="submit" disabled={!numeroCuenta.trim() || crear.isPending} className={BOTON}>
        Agregar panel
      </button>
      {error && <span className="text-prio1 text-xs">{error}</span>}
    </form>
  );
}

function FormularioContacto({ clienteId, alCrear }: { clienteId: number; alCrear: () => void }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [palabraClave, setPalabraClave] = useState('');
  const crear = useMutation({
    mutationFn: () => crearContacto({ clienteId, nombre, telefono, palabraClave: palabraClave || undefined }),
    onSuccess: () => {
      setNombre('');
      setTelefono('');
      setPalabraClave('');
      alCrear();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
      className="flex flex-wrap gap-2 items-center"
    >
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" required className={CAMPO} />
      <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" required className={CAMPO} />
      <input value={palabraClave} onChange={(e) => setPalabraClave(e.target.value)} placeholder="Palabra clave" className={CAMPO} />
      <button type="submit" disabled={!nombre.trim() || !telefono.trim() || crear.isPending} className={BOTON}>
        Agregar contacto
      </button>
    </form>
  );
}
