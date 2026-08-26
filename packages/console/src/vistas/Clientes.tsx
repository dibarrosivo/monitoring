import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  crearCliente,
  crearContacto,
  crearHorario,
  crearPanel,
  crearSitio,
  crearUsuario,
  crearZona,
  editarCliente,
  editarContacto,
  editarPanel,
  editarSitio,
  editarZona,
  eliminarContacto,
  eliminarHorario,
  eliminarSitio,
  eliminarZona,
  editarUsuario,
  listarClientes,
  listarHorarios,
  listarPaneles,
  listarUsuarios,
  listarZonas,
  usuarioGuardado,
  verCliente,
} from '../api.js';
import type { Cliente, Contacto, EstadoPanel, Sitio } from '../tipos.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';
const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export function Clientes() {
  const { data: clientes, isLoading } = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
  const [seleccionado, setSeleccionado] = useState<number | null>(null);

  if (isLoading) return <p className="text-tenue">Cargando clientes…</p>;

  return (
    <div className="flex gap-4 items-start">
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <FormularioCliente />
        <ul className="bg-superficie border border-borde rounded-sm overflow-hidden">
          {(clientes ?? []).map((cliente) => (
            <li key={cliente.id}>
              <button
                onClick={() => setSeleccionado(cliente.id)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-borde/50 last:border-0 ${
                  seleccionado === cliente.id ? 'bg-superficie-2 font-semibold' : 'hover:bg-superficie-2/50'
                } ${cliente.activo ? '' : 'opacity-50'}`}
              >
                {cliente.nombre}
                {!cliente.activo && <span className="text-prio2 text-xs"> · inactivo</span>}
                {cliente.telefono && <span className="block font-datos text-xs text-tenue">{cliente.telefono}</span>}
              </button>
            </li>
          ))}
          {(clientes ?? []).length === 0 && (
            <li className="px-4 py-5 text-sm text-tenue">Sin clientes cargados. Alta con el formulario de arriba.</li>
          )}
        </ul>
      </div>

      {seleccionado !== null && <DetalleCliente clienteId={seleccionado} />}
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

function DetalleCliente({ clienteId }: { clienteId: number }) {
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

      {usuarioGuardado()?.rol === 'admin' && <UsuariosApp clienteId={clienteId} />}
    </div>
  );
}

/** Cuentas de la app móvil del cliente (solo administradores). */
function UsuariosApp({ clienteId }: { clienteId: number }) {
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

  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
      <h3 className="text-tenue text-xs uppercase tracking-wider">Usuarios de la app móvil</h3>
      <ul className="text-sm flex flex-col gap-1.5">
        {(usuarios ?? []).map((u) => (
          <li key={u.id} className={`flex gap-3 items-center ${u.activo ? '' : 'opacity-50'}`}>
            <span className="font-semibold">{u.nombre}</span>
            <span className="font-datos text-tenue">{u.email}</span>
            {!u.activo && <span className="text-prio2 text-xs">INACTIVO</span>}
            <button
              onClick={() => alternar.mutate({ id: u.id, activo: !u.activo })}
              className={u.activo ? BOTON_MINI_ROJO : BOTON_MINI}
            >
              {u.activo ? 'Desactivar' : 'Reactivar'}
            </button>
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
  const [datos, setDatos] = useState({
    nombre: cliente.nombre,
    telefono: cliente.telefono ?? '',
    email: cliente.email ?? '',
    direccion: cliente.direccion ?? '',
  });
  const guardar = useMutation({
    mutationFn: () =>
      editarCliente(cliente.id, {
        nombre: datos.nombre,
        telefono: datos.telefono || undefined,
        email: datos.email || undefined,
        direccion: datos.direccion || undefined,
      }),
    onSuccess: () => {
      setEditando(false);
      alCambiar();
    },
  });
  const alternarActivo = useMutation({
    mutationFn: () => editarCliente(cliente.id, { activo: !cliente.activo }),
    onSuccess: alCambiar,
  });

  if (!editando) {
    return (
      <header className="bg-superficie border border-borde rounded-sm p-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-lg">{cliente.nombre}</h2>
          {!cliente.activo && <span className="text-prio2 text-xs">INACTIVO</span>}
          <button onClick={() => setEditando(true)} className={BOTON_MINI}>
            Editar
          </button>
          <button onClick={() => alternarActivo.mutate()} className={cliente.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
            {cliente.activo ? 'Desactivar' : 'Reactivar'}
          </button>
        </div>
        <p className="text-sm text-tenue">
          {[cliente.telefono, cliente.email, cliente.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
        </p>
      </header>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
      className="bg-superficie border border-borde rounded-sm p-4 flex flex-wrap gap-2 items-center"
    >
      <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} required className={CAMPO} />
      <input value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} placeholder="Teléfono" className={CAMPO} />
      <input value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} placeholder="Email" className={CAMPO} />
      <input value={datos.direccion} onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} placeholder="Dirección" className={CAMPO} />
      <button type="submit" disabled={guardar.isPending} className={BOTON}>
        Guardar
      </button>
      <button type="button" onClick={() => setEditando(false)} className={BOTON_MINI}>
        Cancelar
      </button>
    </form>
  );
}

function TarjetaSitio({ sitio, paneles, alCambiar }: { sitio: Sitio; paneles: EstadoPanel[]; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(sitio.nombre);
  const [direccion, setDireccion] = useState(sitio.direccion ?? '');
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () => editarSitio(sitio.id, { nombre, direccion: direccion || undefined }),
    onSuccess: () => {
      setEditando(false);
      alCambiar();
    },
  });
  const borrar = useMutation({
    mutationFn: () => eliminarSitio(sitio.id),
    onSuccess: alCambiar,
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo eliminar'),
  });

  return (
    <div className="border border-borde rounded-sm p-3 flex flex-col gap-2">
      {editando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
          className="flex flex-wrap gap-2 items-center"
        >
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={CAMPO} />
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección" className={CAMPO} />
          <button type="submit" className={BOTON}>
            Guardar
          </button>
          <button type="button" onClick={() => setEditando(false)} className={BOTON_MINI}>
            Cancelar
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-semibold">{sitio.nombre}</span>
          {sitio.direccion && <span className="text-tenue text-sm">{sitio.direccion}</span>}
          <button onClick={() => setEditando(true)} className={BOTON_MINI}>
            Editar
          </button>
          {paneles.length === 0 && (
            <button onClick={() => borrar.mutate()} className={BOTON_MINI_ROJO}>
              Eliminar
            </button>
          )}
          {error && <span className="text-prio1 text-xs">{error}</span>}
        </div>
      )}

      {paneles.map((panel) => (
        <TarjetaPanel key={panel.id} panel={panel} alCambiar={alCambiar} />
      ))}
      <FormularioPanel sitioId={sitio.id} alCrear={alCambiar} />
    </div>
  );
}

function TarjetaPanel({ panel, alCambiar }: { panel: EstadoPanel; alCambiar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [intervalo, setIntervalo] = useState(String(panel.intervaloPruebaMin));
  const [supervisado, setSupervisado] = useState(panel.supervisado);

  const guardar = useMutation({
    mutationFn: () => editarPanel(panel.id, { intervaloPruebaMin: Number(intervalo), supervisado }),
    onSuccess: () => {
      setEditando(false);
      alCambiar();
    },
  });
  const alternarActivo = useMutation({
    mutationFn: () => editarPanel(panel.id, { activo: !panel.activo }),
    onSuccess: alCambiar,
  });

  return (
    <div className={`border border-borde/60 rounded-sm p-2.5 flex flex-col gap-2 ${panel.activo ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-3 font-datos text-sm">
        <span className="font-semibold text-texto">cuenta {panel.numeroCuenta}</span>
        <span className="text-tenue font-ui">
          {panel.tipo} · prueba cada {panel.intervaloPruebaMin} min{!panel.supervisado && ' · sin supervisión'}
          {!panel.activo && ' · INACTIVO'}
        </span>
        <button onClick={() => setAbierto(!abierto)} className={BOTON_MINI}>
          {abierto ? 'Ocultar zonas y horarios' : 'Zonas y horarios'}
        </button>
        <button onClick={() => setEditando(!editando)} className={BOTON_MINI}>
          Editar
        </button>
        <button onClick={() => alternarActivo.mutate()} className={panel.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
          {panel.activo ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>

      {editando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
          className="flex flex-wrap gap-2 items-center text-sm"
        >
          <label className="flex items-center gap-1.5 text-tenue">
            Prueba cada
            <input value={intervalo} onChange={(e) => setIntervalo(e.target.value)} type="number" min="1" className={`${CAMPO} w-24`} />
            min
          </label>
          <label className="flex items-center gap-1.5 text-tenue">
            <input type="checkbox" checked={supervisado} onChange={(e) => setSupervisado(e.target.checked)} />
            Supervisado
          </label>
          <button type="submit" className={BOTON}>
            Guardar
          </button>
        </form>
      )}

      {abierto && (
        <div className="grid md:grid-cols-2 gap-3">
          <Zonas panelId={panel.id} />
          <Horarios panelId={panel.id} />
        </div>
      )}
    </div>
  );
}

function Zonas({ panelId }: { panelId: number }) {
  const clienteConsultas = useQueryClient();
  const { data: zonas } = useQuery({ queryKey: ['zonas', panelId], queryFn: () => listarZonas(panelId) });
  const [numero, setNumero] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['zonas', panelId] });
  const crear = useMutation({
    mutationFn: () => crearZona({ panelId, numero: numero.padStart(3, '0'), descripcion: descripcion || undefined }),
    onSuccess: () => {
      setNumero('');
      setDescripcion('');
      refrescar();
    },
  });

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-tenue text-xs uppercase tracking-wider">Zonas</h4>
      <ul className="text-sm flex flex-col gap-1">
        {(zonas ?? []).map((zona) => (
          <FilaZona key={zona.id} zona={zona} alCambiar={refrescar} />
        ))}
        {(zonas ?? []).length === 0 && <li className="text-tenue">Sin zonas descriptas.</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
        className="flex flex-wrap gap-1.5"
      >
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="N°" required className={`${CAMPO} w-16 font-datos`} />
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (Puerta principal…)" className={`${CAMPO} flex-1`} />
        <button type="submit" disabled={!numero.trim() || crear.isPending} className={BOTON}>
          Agregar
        </button>
      </form>
    </div>
  );
}

function FilaZona({ zona, alCambiar }: { zona: { id: number; numero: string; descripcion: string | null }; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [descripcion, setDescripcion] = useState(zona.descripcion ?? '');
  const guardar = useMutation({
    mutationFn: () => editarZona(zona.id, { descripcion }),
    onSuccess: () => {
      setEditando(false);
      alCambiar();
    },
  });
  const borrar = useMutation({ mutationFn: () => eliminarZona(zona.id), onSuccess: alCambiar });

  if (editando) {
    return (
      <li className="flex gap-1.5 items-center">
        <span className="font-datos text-tenue">{zona.numero}</span>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={`${CAMPO} flex-1`} />
        <button onClick={() => guardar.mutate()} className={BOTON_MINI}>
          Guardar
        </button>
      </li>
    );
  }
  return (
    <li className="flex gap-2 items-center">
      <span className="font-datos text-tenue">{zona.numero}</span>
      <span className="flex-1">{zona.descripcion ?? <span className="text-tenue">sin descripción</span>}</span>
      <button onClick={() => setEditando(true)} className={BOTON_MINI}>
        Editar
      </button>
      <button onClick={() => borrar.mutate()} className={BOTON_MINI_ROJO}>
        Eliminar
      </button>
    </li>
  );
}

function Horarios({ panelId }: { panelId: number }) {
  const clienteConsultas = useQueryClient();
  const { data: horarios } = useQuery({ queryKey: ['horarios', panelId], queryFn: () => listarHorarios(panelId) });
  const [dias, setDias] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [apertura, setApertura] = useState('09:00');
  const [cierre, setCierre] = useState('18:00');

  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['horarios', panelId] });
  const crear = useMutation({
    mutationFn: () =>
      crearHorario({
        panelId,
        dias: DIAS.map((d, i) => (dias[i] ? d : '-')).join(''),
        apertura,
        cierre,
      }),
    onSuccess: refrescar,
  });
  const borrar = useMutation({ mutationFn: eliminarHorario, onSuccess: refrescar });

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-tenue text-xs uppercase tracking-wider">Horarios (apertura/cierre esperados)</h4>
      <ul className="text-sm flex flex-col gap-1">
        {(horarios ?? []).map((horario) => (
          <li key={horario.id} className="flex gap-2 items-center font-datos">
            <span>{horario.dias}</span>
            <span className="text-tenue">
              {horario.apertura.slice(0, 5)}–{horario.cierre.slice(0, 5)} ±{horario.toleranciaMin}min
            </span>
            <button onClick={() => borrar.mutate(horario.id)} className={BOTON_MINI_ROJO}>
              Eliminar
            </button>
          </li>
        ))}
        {(horarios ?? []).length === 0 && <li className="text-tenue">Sin horario: no se supervisan aperturas/cierres.</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
        className="flex flex-wrap gap-1.5 items-center"
      >
        <span className="flex gap-1">
          {DIAS.map((dia, i) => (
            <label key={dia} className={`px-1.5 py-0.5 border rounded-sm text-xs font-datos cursor-pointer ${dias[i] ? 'border-acento text-acento' : 'border-borde text-tenue'}`}>
              <input
                type="checkbox"
                checked={dias[i]}
                onChange={(e) => setDias(dias.map((v, j) => (j === i ? e.target.checked : v)))}
                className="sr-only"
              />
              {dia}
            </label>
          ))}
        </span>
        <input type="time" value={apertura} onChange={(e) => setApertura(e.target.value)} className={`${CAMPO} font-datos`} />
        <input type="time" value={cierre} onChange={(e) => setCierre(e.target.value)} className={`${CAMPO} font-datos`} />
        <button type="submit" disabled={crear.isPending} className={BOTON}>
          Agregar
        </button>
      </form>
    </div>
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
