import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  crearCliente,
  crearContacto,
  crearPanel,
  crearSitio,
  listarClientes,
  listarPaneles,
  verCliente,
} from '../api.js';

const CAMPO = 'bg-fondo border border-borde rounded px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded px-3 py-1.5 text-sm disabled:opacity-50';

export function Clientes() {
  const { data: clientes, isLoading } = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
  const [seleccionado, setSeleccionado] = useState<number | null>(null);

  if (isLoading) return <p className="text-tenue">Cargando clientes…</p>;

  return (
    <div className="flex gap-5 items-start">
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <FormularioCliente />
        <ul className="bg-superficie border border-borde rounded-md overflow-hidden">
          {(clientes ?? []).map((cliente) => (
            <li key={cliente.id}>
              <button
                onClick={() => setSeleccionado(cliente.id)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-borde/50 last:border-0 ${
                  seleccionado === cliente.id ? 'bg-superficie-2 font-semibold' : 'hover:bg-superficie-2/50'
                }`}
              >
                {cliente.nombre}
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
      className="bg-superficie border border-borde rounded-md p-3 flex flex-col gap-2"
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
    void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
  }

  if (!detalle) return <p className="text-tenue">Cargando…</p>;

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4">
      <header className="bg-superficie border border-borde rounded-md p-4">
        <h2 className="font-semibold text-lg">{detalle.nombre}</h2>
        <p className="text-sm text-tenue">
          {[detalle.telefono, detalle.email, detalle.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
        </p>
      </header>

      <section className="bg-superficie border border-borde rounded-md p-4 flex flex-col gap-3">
        <h3 className="text-tenue text-xs uppercase tracking-wider">Sitios y paneles</h3>
        {detalle.sitios.map((sitio) => (
          <div key={sitio.id} className="border border-borde rounded p-3 flex flex-col gap-2">
            <div>
              <span className="font-semibold">{sitio.nombre}</span>
              {sitio.direccion && <span className="text-tenue text-sm"> · {sitio.direccion}</span>}
            </div>
            <ul className="font-datos text-sm flex flex-col gap-1">
              {(paneles ?? [])
                .filter((panel) => panel.sitioId === sitio.id)
                .map((panel) => (
                  <li key={panel.id} className="text-tenue">
                    cuenta <span className="text-texto">{panel.numeroCuenta}</span> · {panel.tipo} · prueba cada{' '}
                    {panel.intervaloPruebaMin} min
                  </li>
                ))}
            </ul>
            <FormularioPanel sitioId={sitio.id} alCrear={refrescar} />
          </div>
        ))}
        {detalle.sitios.length === 0 && <p className="text-sm text-tenue">Sin sitios. El panel se cuelga de un sitio.</p>}
        <FormularioSitio clienteId={clienteId} alCrear={refrescar} />
      </section>

      <section className="bg-superficie border border-borde rounded-md p-4 flex flex-col gap-3">
        <h3 className="text-tenue text-xs uppercase tracking-wider">Lista de llamadas</h3>
        <ol className="text-sm flex flex-col gap-1">
          {detalle.contactos.map((contacto) => (
            <li key={contacto.id}>
              <span className="font-datos text-tenue">{contacto.orden}.</span>{' '}
              <span className="font-semibold">{contacto.nombre}</span>{' '}
              <span className="font-datos">{contacto.telefono}</span>
              {contacto.palabraClave && <span className="text-tenue"> · palabra clave: {contacto.palabraClave}</span>}
            </li>
          ))}
          {detalle.contactos.length === 0 && <li className="text-tenue">Sin contactos cargados.</li>}
        </ol>
        <FormularioContacto clienteId={clienteId} alCrear={refrescar} />
      </section>
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
      <input
        value={palabraClave}
        onChange={(e) => setPalabraClave(e.target.value)}
        placeholder="Palabra clave"
        className={CAMPO}
      />
      <button type="submit" disabled={!nombre.trim() || !telefono.trim() || crear.isPending} className={BOTON}>
        Agregar contacto
      </button>
    </form>
  );
}
