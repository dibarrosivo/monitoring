import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cambiarEstadoCliente,
  crearAcceso,
  crearAlta,
  crearContacto,
  crearPanel,
  crearSitio,
  crearUsuario,
  editarCliente,
  editarContacto,
  editarSitio,
  editarUsuario,
  eliminarAcceso,
  eliminarContacto,
  eliminarSitio,
  impersonar,
  iniciarImpersonacion,
  listarAccesos,
  listarAuditoria,
  listarClientes,
  listarPaneles,
  listarUsuarios,
  usuarioGuardado,
  verCliente,
} from '../api.js';
import type { Cliente, Contacto, EstadoCliente, EstadoPanel, Sitio, TipoSitio } from '../tipos.js';
import { Modal } from '../Modal.js';
import { fechaHora } from '../tiempo.js';
import { nombreCuenta, NOMBRE_TIPO_PANEL } from '../ui.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';
const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';

const ESTADO: Record<EstadoCliente, { nombre: string; clase: string }> = {
  activo: { nombre: 'Activo', clase: 'text-ok' },
  suspendido: { nombre: 'Suspendido', clase: 'text-prio2' },
  baja: { nombre: 'Baja', clase: 'text-tenue' },
};

const TIPOS_SITIO: { valor: TipoSitio; nombre: string }[] = [
  { valor: 'residencial', nombre: 'Residencial' },
  { valor: 'comercial', nombre: 'Comercial' },
  { valor: 'industria', nombre: 'Industria' },
  { valor: 'gobierno', nombre: 'Gobierno' },
  { valor: 'apartamento', nombre: 'Apartamento' },
  { valor: 'centro_comercial', nombre: 'Centro comercial' },
  { valor: 'otro', nombre: 'Otro' },
];

const NOMBRE_PERSONA = { natural: 'Persona natural', juridico: 'Persona jurídica', gobierno: 'Gobierno', otro: 'Otro' };

function fechaCorta(iso: string | null | undefined): string {
  return iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';
}

export function Clientes({
  clienteInicial = null,
  alAbrirDispositivo,
}: {
  clienteInicial?: number | null;
  alAbrirDispositivo: (panelId: number) => void;
}) {
  const { data: clientes, isLoading } = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
  const [seleccionado, setSeleccionado] = useState<number | null>(clienteInicial);
  const [altaVisible, setAltaVisible] = useState(false);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    if (clienteInicial !== null) setSeleccionado(clienteInicial);
  }, [clienteInicial]);

  if (isLoading) return <p className="text-tenue">Cargando clientes…</p>;

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

  const termino = filtro.trim().toLowerCase();
  const visibles = (clientes ?? []).filter(
    (c) => !termino || c.nombre.toLowerCase().includes(termino) || (c.documento ?? '').toLowerCase().includes(termino),
  );

  return (
    <div className="flex flex-col gap-3 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setAltaVisible(true)}
          className="bg-acento/15 hover:bg-acento/25 border border-acento text-acento rounded-sm px-3 py-1.5 text-sm font-semibold"
        >
          + Alta de cliente
        </button>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por nombre o documento…"
          className={`${CAMPO} w-72`}
        />
        <span className="text-tenue text-sm">
          {visibles.length} de {(clientes ?? []).length} clientes
        </span>
      </div>

      <div className="bg-superficie border border-borde rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-tenue text-xs uppercase tracking-wider border-b border-borde">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 font-medium text-right">Disp.</th>
              <th className="px-3 py-2 font-medium">Salud</th>
              <th className="px-3 py-2 font-medium text-right">Alarmas</th>
              <th className="px-3 py-2 font-medium">Vencimiento</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSeleccionado(c.id)}
                className={`border-b border-borde/50 last:border-0 cursor-pointer hover:bg-superficie-2/60 ${
                  c.estado === 'baja' ? 'opacity-50' : ''
                }`}
              >
                <td className="px-3 py-1.5 font-semibold">{c.nombre}</td>
                <td className="px-3 py-1.5 font-datos text-tenue">{c.documento ?? '—'}</td>
                <td className="px-3 py-1.5 font-datos text-tenue">{c.telefono ?? c.movil ?? '—'}</td>
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
                <td
                  className={`px-3 py-1.5 font-datos text-right ${
                    c.alarmasAbiertas > 0 ? 'text-prio1 font-semibold' : 'text-tenue'
                  }`}
                >
                  {c.alarmasAbiertas}
                </td>
                <td className={`px-3 py-1.5 font-datos text-xs ${c.vencidos > 0 ? 'text-prio2 font-semibold' : 'text-tenue'}`}>
                  {c.vencidos > 0 ? `${c.vencidos} vencido${c.vencidos > 1 ? 's' : ''}` : fechaCorta(c.proximoVencimiento)}
                </td>
                <td className={`px-3 py-1.5 text-xs ${ESTADO[c.estado].clase}`}>{ESTADO[c.estado].nombre}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-tenue">
                  {termino ? 'Ningún cliente coincide con el filtro.' : 'Sin clientes cargados. Empiece con “Alta de cliente”.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {altaVisible && <ModalAlta alCerrar={() => setAltaVisible(false)} alCrear={(id) => setSeleccionado(id)} />}
    </div>
  );
}

/**
 * Husos horarios disponibles. El navegador ya trae la lista completa; si no la
 * expone, se cae a las de la región para no dejar el campo vacío.
 */
function zonasHorarias(): string[] {
  const conIntl = Intl as unknown as { supportedValuesOf?: (clave: string) => string[] };
  try {
    const todas = conIntl.supportedValuesOf?.('timeZone');
    if (todas?.length) return todas;
  } catch {
    // Navegador viejo: se usa la lista corta de abajo
  }
  return [
    'America/Caracas',
    'America/Bogota',
    'America/Panama',
    'America/Santo_Domingo',
    'America/New_York',
    'America/Mexico_City',
    'America/Buenos_Aires',
    'Europe/Madrid',
  ];
}

function Campo({
  etiqueta,
  valor,
  alCambiar,
  tipo = 'text',
  requerido = false,
  mono = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  tipo?: string;
  requerido?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-tenue">
        {etiqueta}
        {requerido && ' *'}
      </span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        required={requerido}
        className={`${CAMPO}${mono ? ' font-datos' : ''}`}
      />
    </label>
  );
}

/** Alta en un paso: cliente + sitio + dispositivo + primer contacto. */
function ModalAlta({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (clienteId: number) => void }) {
  const clienteConsultas = useQueryClient();
  const [d, setD] = useState({
    nombre: '',
    documento: '',
    telefono: '',
    email: '',
    sitioNombre: 'Principal',
    tipoSitio: 'comercial' as TipoSitio,
    direccion: '',
    referencia: '',
    numeroCuenta: '',
    tipo: 'hikvision' as EstadoPanel['tipo'],
    marca: '',
    modelo: '',
    montoAbono: '',
    proximoVencimiento: '',
    contactoNombre: '',
    contactoTelefono: '',
  });
  const [error, setError] = useState<string | null>(null);

  const crear = useMutation({
    mutationFn: () =>
      crearAlta({
        cliente: {
          nombre: d.nombre,
          documento: d.documento || undefined,
          telefono: d.telefono || undefined,
          email: d.email || undefined,
        },
        sitio: {
          nombre: d.sitioNombre || 'Principal',
          tipo: d.tipoSitio,
          direccion: d.direccion || undefined,
          referencia: d.referencia || undefined,
        },
        dispositivo: {
          numeroCuenta: d.numeroCuenta,
          tipo: d.tipo,
          marca: d.marca || undefined,
          modelo: d.modelo || undefined,
          montoAbono: d.montoAbono || undefined,
          proximoVencimiento: d.proximoVencimiento || undefined,
        },
        contacto:
          d.contactoNombre && d.contactoTelefono
            ? { nombre: d.contactoNombre, telefono: d.contactoTelefono, orden: 1 }
            : undefined,
      }),
    onSuccess: (resultado) => {
      void clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
      alCerrar();
      alCrear(resultado.cliente.id);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo completar el alta'),
  });

  return (
    <Modal titulo="Alta de cliente" alCerrar={alCerrar} ancho="max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
        className="flex flex-col gap-4 text-sm"
      >
        <section className="grid md:grid-cols-2 gap-3">
          <h3 className="md:col-span-2 text-tenue text-xs uppercase tracking-wider">Cliente</h3>
          <Campo etiqueta="Nombre o razón social" requerido valor={d.nombre} alCambiar={(v) => setD({ ...d, nombre: v })} />
          <Campo etiqueta="Documento (C.I. / RIF)" valor={d.documento} alCambiar={(v) => setD({ ...d, documento: v })} />
          <Campo etiqueta="Teléfono" valor={d.telefono} alCambiar={(v) => setD({ ...d, telefono: v })} />
          <Campo etiqueta="Email" tipo="email" valor={d.email} alCambiar={(v) => setD({ ...d, email: v })} />
        </section>

        <section className="grid md:grid-cols-2 gap-3">
          <h3 className="md:col-span-2 text-tenue text-xs uppercase tracking-wider">Sitio monitoreado</h3>
          <Campo etiqueta="Nombre del sitio" valor={d.sitioNombre} alCambiar={(v) => setD({ ...d, sitioNombre: v })} />
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Tipo</span>
            <select
              value={d.tipoSitio}
              onChange={(e) => setD({ ...d, tipoSitio: e.target.value as TipoSitio })}
              className={CAMPO}
            >
              {TIPOS_SITIO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <Campo etiqueta="Dirección" valor={d.direccion} alCambiar={(v) => setD({ ...d, direccion: v })} />
          <Campo etiqueta="Referencia (cómo llegar)" valor={d.referencia} alCambiar={(v) => setD({ ...d, referencia: v })} />
        </section>

        <section className="grid md:grid-cols-2 gap-3">
          <h3 className="md:col-span-2 text-tenue text-xs uppercase tracking-wider">Dispositivo</h3>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Número de cuenta *</span>
            <input
              value={d.numeroCuenta}
              onChange={(e) => setD({ ...d, numeroCuenta: e.target.value })}
              required
              pattern="[0-9A-Fa-f]{3,16}"
              className={`${CAMPO} font-datos`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Tipo</span>
            <select
              value={d.tipo}
              onChange={(e) => setD({ ...d, tipo: e.target.value as EstadoPanel['tipo'] })}
              className={CAMPO}
            >
              <option value="hikvision">Hikvision</option>
              <option value="ebs">EBS</option>
              <option value="pima">PIMA</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <Campo etiqueta="Marca" valor={d.marca} alCambiar={(v) => setD({ ...d, marca: v })} />
          <Campo etiqueta="Modelo" valor={d.modelo} alCambiar={(v) => setD({ ...d, modelo: v })} />
          <Campo etiqueta="Abono" valor={d.montoAbono} alCambiar={(v) => setD({ ...d, montoAbono: v })} />
          <Campo
            etiqueta="Próximo vencimiento"
            tipo="date"
            valor={d.proximoVencimiento}
            alCambiar={(v) => setD({ ...d, proximoVencimiento: v })}
          />
        </section>

        <section className="grid md:grid-cols-2 gap-3">
          <h3 className="md:col-span-2 text-tenue text-xs uppercase tracking-wider">Primer contacto (opcional)</h3>
          <Campo etiqueta="Nombre" valor={d.contactoNombre} alCambiar={(v) => setD({ ...d, contactoNombre: v })} />
          <Campo etiqueta="Teléfono" valor={d.contactoTelefono} alCambiar={(v) => setD({ ...d, contactoTelefono: v })} />
        </section>

        {error && <p className="text-prio1">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCerrar} className="text-tenue hover:text-texto">
            Cancelar
          </button>
          <button type="submit" disabled={crear.isPending} className={BOTON}>
            Crear cliente, sitio y dispositivo
          </button>
        </div>
      </form>
    </Modal>
  );
}

type Pestana = 'comercial' | 'operativo' | 'dispositivos' | 'accesos' | 'historial';

function DetalleCliente({
  clienteId,
  alAbrirDispositivo,
}: {
  clienteId: number;
  alAbrirDispositivo: (panelId: number) => void;
}) {
  const clienteConsultas = useQueryClient();
  const { data: detalle } = useQuery({ queryKey: ['cliente', clienteId], queryFn: () => verCliente(clienteId) });
  const { data: paneles } = useQuery({ queryKey: ['paneles'], queryFn: listarPaneles });
  const [pestana, setPestana] = useState<Pestana>('comercial');
  const [editando, setEditando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['cliente', clienteId] });
    void clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
  }

  if (!detalle) return <p className="text-tenue">Cargando…</p>;

  const esAdmin = usuarioGuardado()?.rol === 'admin';
  const panelesDelCliente = (paneles ?? []).filter((p) => detalle.sitios.some((s) => s.id === p.sitioId));
  const pestanas: { clave: Pestana; nombre: string }[] = [
    { clave: 'comercial', nombre: 'Comercial' },
    { clave: 'operativo', nombre: 'Operativo' },
    { clave: 'dispositivos', nombre: 'Sitios y dispositivos' },
    ...(esAdmin ? [{ clave: 'accesos' as Pestana, nombre: 'Accesos a la app' }] : []),
    { clave: 'historial', nombre: 'Historial' },
  ];

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <header className="bg-superficie border border-borde rounded-sm p-4 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-lg">{detalle.nombre}</h2>
        <span className={`text-xs font-semibold ${ESTADO[detalle.estado].clase}`}>
          {ESTADO[detalle.estado].nombre.toUpperCase()}
          {detalle.motivoEstado && <span className="text-tenue font-normal"> · {detalle.motivoEstado}</span>}
        </span>
        <button onClick={() => setEditando(true)} className={BOTON_MINI} title="Editar cliente">
          ✎ Editar
        </button>
        <button onClick={() => setCambiandoEstado(true)} className={BOTON_MINI}>
          Cambiar estado
        </button>
        <span className="ml-auto text-tenue text-xs font-datos">
          alta {fechaCorta(detalle.fechaAlta)} · {detalle.documento ?? 'sin documento'}
        </span>
      </header>

      <nav className="flex gap-1 flex-wrap">
        {pestanas.map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestana(p.clave)}
            className={`px-3 py-1.5 rounded-sm text-sm border ${
              pestana === p.clave
                ? 'bg-superficie-2 border-borde font-semibold'
                : 'border-transparent text-tenue hover:text-texto'
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </nav>

      {pestana === 'comercial' && <PanelComercial cliente={detalle} />}
      {pestana === 'operativo' && <PanelOperativo detalle={detalle} alCambiar={refrescar} />}
      {pestana === 'dispositivos' && (
        <PanelDispositivos
          detalle={detalle}
          paneles={panelesDelCliente}
          alCambiar={refrescar}
          alAbrirDispositivo={alAbrirDispositivo}
        />
      )}
      {pestana === 'accesos' && esAdmin && (
        <UsuariosApp clienteId={clienteId} sitios={detalle.sitios} paneles={panelesDelCliente} />
      )}
      {pestana === 'historial' && <PanelHistorial clienteId={clienteId} />}

      {editando && <ModalEditarCliente cliente={detalle} alCerrar={() => setEditando(false)} alCambiar={refrescar} />}
      {cambiandoEstado && (
        <ModalEstado cliente={detalle} alCerrar={() => setCambiandoEstado(false)} alCambiar={refrescar} />
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-tenue text-xs uppercase tracking-wider">{etiqueta}</p>
      <p className="text-sm">{valor || <span className="text-tenue">—</span>}</p>
    </div>
  );
}

function PanelComercial({ cliente }: { cliente: Cliente }) {
  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Dato etiqueta="Documento" valor={cliente.documento} />
      <Dato etiqueta="Tipo" valor={NOMBRE_PERSONA[cliente.tipoPersona]} />
      <Dato etiqueta="Fecha de alta" valor={fechaCorta(cliente.fechaAlta)} />
      <Dato etiqueta="Teléfono" valor={cliente.telefono} />
      <Dato etiqueta="Móvil" valor={cliente.movil} />
      <Dato etiqueta="Email" valor={cliente.email} />
      <Dato etiqueta="Dirección administrativa" valor={cliente.direccion} />
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="text-tenue text-xs uppercase tracking-wider">Notas internas</p>
        <p className="text-sm whitespace-pre-wrap">{cliente.notas || <span className="text-tenue">—</span>}</p>
      </div>
    </section>
  );
}

function PanelOperativo({
  detalle,
  alCambiar,
}: {
  detalle: Cliente & { contactos: Contacto[] };
  alCambiar: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <section className="bg-superficie border border-borde rounded-sm p-4">
        <p className="text-tenue text-xs uppercase tracking-wider mb-1">Plan de acción del cliente</p>
        {detalle.instrucciones ? (
          <p className="text-sm whitespace-pre-wrap border-l-2 border-prio2 pl-2">{detalle.instrucciones}</p>
        ) : (
          <p className="text-sm text-tenue">
            Sin plan de acción. Se muestra al operador ante cada alarma; un sitio puede tener el suyo propio.
          </p>
        )}
      </section>

      <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
        <h3 className="text-tenue text-xs uppercase tracking-wider">Lista de llamadas</h3>
        <ol className="text-sm flex flex-col gap-1.5">
          {detalle.contactos.map((c) => (
            <FilaContacto key={c.id} contacto={c} alCambiar={alCambiar} />
          ))}
          {detalle.contactos.length === 0 && <li className="text-tenue">Sin contactos cargados.</li>}
        </ol>
        <FormularioContacto clienteId={detalle.id} alCrear={alCambiar} />
      </section>
    </div>
  );
}

function PanelDispositivos({
  detalle,
  paneles,
  alCambiar,
  alAbrirDispositivo,
}: {
  detalle: Cliente & { sitios: Sitio[] };
  paneles: EstadoPanel[];
  alCambiar: () => void;
  alAbrirDispositivo: (panelId: number) => void;
}) {
  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
      {detalle.sitios.map((sitio) => (
        <TarjetaSitio
          key={sitio.id}
          sitio={sitio}
          paneles={paneles.filter((p) => p.sitioId === sitio.id)}
          alCambiar={alCambiar}
          alAbrirDispositivo={alAbrirDispositivo}
        />
      ))}
      {detalle.sitios.length === 0 && <p className="text-sm text-tenue">Sin sitios cargados.</p>}
      <FormularioSitio clienteId={detalle.id} alCrear={alCambiar} />
    </section>
  );
}

function PanelHistorial({ clienteId }: { clienteId: number }) {
  const { data: registros } = useQuery({
    queryKey: ['auditoria', 'cliente', clienteId],
    queryFn: () => listarAuditoria('cliente', clienteId),
  });

  return (
    <section className="bg-superficie border border-borde rounded-sm p-4">
      <h3 className="text-tenue text-xs uppercase tracking-wider mb-2">Cambios administrativos</h3>
      <ul className="text-sm flex flex-col gap-1.5">
        {(registros ?? []).map((r) => (
          <li key={r.id} className="border-l-2 border-borde pl-2.5">
            <span className="font-datos text-xs text-tenue">{fechaHora(r.creadoEn)}</span>{' '}
            <span className="font-semibold">{r.accion}</span>
            {r.usuarioNombre && <span className="text-tenue"> por {r.usuarioNombre}</span>}
            {r.cambios && (
              <p className="text-tenue text-xs font-datos truncate">{JSON.stringify(r.cambios).slice(0, 160)}</p>
            )}
          </li>
        ))}
        {(registros ?? []).length === 0 && <li className="text-tenue">Sin cambios registrados.</li>}
      </ul>
    </section>
  );
}

function ModalEditarCliente({
  cliente,
  alCerrar,
  alCambiar,
}: {
  cliente: Cliente;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const [d, setD] = useState({
    nombre: cliente.nombre,
    documento: cliente.documento ?? '',
    tipoPersona: cliente.tipoPersona,
    telefono: cliente.telefono ?? '',
    movil: cliente.movil ?? '',
    email: cliente.email ?? '',
    direccion: cliente.direccion ?? '',
    fechaAlta: cliente.fechaAlta ?? '',
    instrucciones: cliente.instrucciones ?? '',
    notas: cliente.notas ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () =>
      editarCliente(cliente.id, {
        nombre: d.nombre,
        documento: d.documento || undefined,
        tipoPersona: d.tipoPersona,
        telefono: d.telefono || undefined,
        movil: d.movil || undefined,
        email: d.email || undefined,
        direccion: d.direccion || undefined,
        fechaAlta: d.fechaAlta || undefined,
        instrucciones: d.instrucciones || undefined,
        notas: d.notas || undefined,
      } as Partial<Cliente>),
    onSuccess: () => {
      alCambiar();
      alCerrar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo guardar'),
  });

  return (
    <Modal titulo={`Editar cliente — ${cliente.nombre}`} alCerrar={alCerrar} ancho="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <div className="grid md:grid-cols-2 gap-3">
          <Campo etiqueta="Nombre o razón social" requerido valor={d.nombre} alCambiar={(v) => setD({ ...d, nombre: v })} />
          <Campo etiqueta="Documento (C.I. / RIF)" valor={d.documento} alCambiar={(v) => setD({ ...d, documento: v })} />
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Tipo de persona</span>
            <select
              value={d.tipoPersona}
              onChange={(e) => setD({ ...d, tipoPersona: e.target.value as Cliente['tipoPersona'] })}
              className={CAMPO}
            >
              <option value="natural">Persona natural</option>
              <option value="juridico">Persona jurídica</option>
              <option value="gobierno">Gobierno</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <Campo etiqueta="Fecha de alta" tipo="date" valor={d.fechaAlta} alCambiar={(v) => setD({ ...d, fechaAlta: v })} />
          <Campo etiqueta="Teléfono" valor={d.telefono} alCambiar={(v) => setD({ ...d, telefono: v })} />
          <Campo etiqueta="Móvil" valor={d.movil} alCambiar={(v) => setD({ ...d, movil: v })} />
          <Campo etiqueta="Email" tipo="email" valor={d.email} alCambiar={(v) => setD({ ...d, email: v })} />
          <Campo etiqueta="Dirección administrativa" valor={d.direccion} alCambiar={(v) => setD({ ...d, direccion: v })} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Plan de acción (se muestra al operador ante cada alarma)</span>
          <textarea
            value={d.instrucciones}
            onChange={(e) => setD({ ...d, instrucciones: e.target.value })}
            rows={3}
            className={`${CAMPO} resize-none`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Notas internas</span>
          <textarea
            value={d.notas}
            onChange={(e) => setD({ ...d, notas: e.target.value })}
            rows={2}
            className={`${CAMPO} resize-none`}
          />
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

/** El estado comercial nunca corta el monitoreo: solo informa y queda auditado. */
function ModalEstado({
  cliente,
  alCerrar,
  alCambiar,
}: {
  cliente: Cliente;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoCliente>(cliente.estado);
  const [motivo, setMotivo] = useState(cliente.motivoEstado ?? '');
  const guardar = useMutation({
    mutationFn: () => cambiarEstadoCliente(cliente.id, estado, motivo || undefined),
    onSuccess: () => {
      alCambiar();
      alCerrar();
    },
  });

  return (
    <Modal titulo={`Estado comercial — ${cliente.nombre}`} alCerrar={alCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoCliente)} className={CAMPO}>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido (por pago u otro motivo)</option>
            <option value="baja">Baja</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Motivo</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CAMPO} />
        </label>
        <p className="text-tenue text-xs">
          El estado no interrumpe el monitoreo: las señales se siguen recibiendo y las alarmas se atienden igual.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCerrar} className="text-tenue hover:text-texto">
            Cancelar
          </button>
          <button type="submit" disabled={guardar.isPending} className={BOTON}>
            Guardar
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
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-semibold">{sitio.nombre}</span>
        <span className="text-tenue text-xs uppercase">{TIPOS_SITIO.find((t) => t.valor === sitio.tipo)?.nombre}</span>
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
      {(sitio.referencia || sitio.llaves) && (
        <p className="text-tenue text-xs">
          {sitio.referencia}
          {sitio.referencia && sitio.llaves && ' · '}
          {sitio.llaves && `llaves: ${sitio.llaves}`}
        </p>
      )}

      {paneles.map((panel) => (
        <button
          key={panel.id}
          onClick={() => alAbrirDispositivo(panel.id)}
          className={`flex items-center gap-3 border border-borde/60 rounded-sm p-2.5 text-left text-sm hover:border-acento ${
            panel.activo ? '' : 'opacity-60'
          }`}
        >
          <span className="font-datos font-semibold">cuenta {nombreCuenta(panel.prefijo, panel.numeroCuenta)}</span>
          <span className="text-tenue">
            {[panel.alias, NOMBRE_TIPO_PANEL[panel.tipo] ?? panel.tipo, panel.marca, panel.modelo].filter(Boolean).join(' · ')}
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

function ModalEditarSitio({
  sitio,
  alCerrar,
  alCambiar,
}: {
  sitio: Sitio;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const [d, setD] = useState({
    nombre: sitio.nombre,
    tipo: sitio.tipo,
    direccion: sitio.direccion ?? '',
    ciudad: sitio.ciudad ?? '',
    referencia: sitio.referencia ?? '',
    latitud: sitio.latitud?.toString() ?? '',
    longitud: sitio.longitud?.toString() ?? '',
    telefono: sitio.telefono ?? '',
    zonaHoraria: sitio.zonaHoraria ?? '',
    llaves: sitio.llaves ?? '',
    puntoTag: sitio.puntoTag ?? '',
    instruccionesAcceso: sitio.instruccionesAcceso ?? '',
    instrucciones: sitio.instrucciones ?? '',
    notas: sitio.notas ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () =>
      editarSitio(sitio.id, {
        nombre: d.nombre,
        tipo: d.tipo,
        direccion: d.direccion || undefined,
        ciudad: d.ciudad || undefined,
        referencia: d.referencia || undefined,
        latitud: d.latitud ? Number(d.latitud) : null,
        longitud: d.longitud ? Number(d.longitud) : null,
        telefono: d.telefono || undefined,
        zonaHoraria: d.zonaHoraria || null,
        llaves: d.llaves || undefined,
        puntoTag: d.puntoTag || undefined,
        instruccionesAcceso: d.instruccionesAcceso || undefined,
        instrucciones: d.instrucciones || undefined,
        notas: d.notas || undefined,
      }),
    onSuccess: () => {
      alCambiar();
      alCerrar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo guardar'),
  });

  return (
    <Modal titulo={`Editar sitio — ${sitio.nombre}`} alCerrar={alCerrar} ancho="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <div className="grid md:grid-cols-2 gap-3">
          <Campo etiqueta="Nombre" requerido valor={d.nombre} alCambiar={(v) => setD({ ...d, nombre: v })} />
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Tipo</span>
            <select value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoSitio })} className={CAMPO}>
              {TIPOS_SITIO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <Campo etiqueta="Dirección" valor={d.direccion} alCambiar={(v) => setD({ ...d, direccion: v })} />
          <Campo etiqueta="Ciudad" valor={d.ciudad} alCambiar={(v) => setD({ ...d, ciudad: v })} />
          <Campo etiqueta="Latitud" mono valor={d.latitud} alCambiar={(v) => setD({ ...d, latitud: v })} />
          <Campo etiqueta="Longitud" mono valor={d.longitud} alCambiar={(v) => setD({ ...d, longitud: v })} />
          <Campo etiqueta="Teléfono del sitio" valor={d.telefono} alCambiar={(v) => setD({ ...d, telefono: v })} />
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Zona horaria</span>
            <select value={d.zonaHoraria} onChange={(e) => setD({ ...d, zonaHoraria: e.target.value })} className={CAMPO}>
              <option value="">Hora del servidor</option>
              {zonasHorarias().map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <span className="text-xs text-tenue">Con la que se supervisan los horarios de apertura y cierre.</span>
          </label>
          <Campo etiqueta="Llaves en la central" valor={d.llaves} alCambiar={(v) => setD({ ...d, llaves: v })} />
          <Campo etiqueta="Punto / Tag de recorrida" valor={d.puntoTag} alCambiar={(v) => setD({ ...d, puntoTag: v })} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Referencia (cómo llegar, entre qué calles)</span>
          <input value={d.referencia} onChange={(e) => setD({ ...d, referencia: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Instrucciones de acceso</span>
          <textarea
            value={d.instruccionesAcceso}
            onChange={(e) => setD({ ...d, instruccionesAcceso: e.target.value })}
            rows={2}
            className={`${CAMPO} resize-none`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Plan de acción del sitio (si está, manda sobre el del cliente)</span>
          <textarea
            value={d.instrucciones}
            onChange={(e) => setD({ ...d, instrucciones: e.target.value })}
            rows={2}
            className={`${CAMPO} resize-none`}
          />
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

function FilaContacto({ contacto, alCambiar }: { contacto: Contacto; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const borrar = useMutation({ mutationFn: () => eliminarContacto(contacto.id), onSuccess: alCambiar });

  return (
    <li className="flex gap-2 items-center flex-wrap">
      <span className="font-datos text-tenue">{contacto.orden}.</span>
      <span className="font-semibold">{contacto.nombre}</span>
      {contacto.rol && <span className="text-tenue text-xs">({contacto.rol})</span>}
      <span className="font-datos text-acento">{contacto.telefono}</span>
      {contacto.palabraClave && <span className="text-tenue text-xs">clave: {contacto.palabraClave}</span>}
      {contacto.autorizadoCancelar && <span className="text-ok text-xs font-semibold">puede cancelar</span>}
      <button onClick={() => setEditando(true)} className={BOTON_MINI}>
        ✎ Editar
      </button>
      <button onClick={() => borrar.mutate()} className={BOTON_MINI_ROJO}>
        Eliminar
      </button>
      {editando && <ModalEditarContacto contacto={contacto} alCerrar={() => setEditando(false)} alCambiar={alCambiar} />}
    </li>
  );
}

function ModalEditarContacto({
  contacto,
  alCerrar,
  alCambiar,
}: {
  contacto: Contacto;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const [d, setD] = useState({
    nombre: contacto.nombre,
    rol: contacto.rol ?? '',
    telefono: contacto.telefono,
    telefonoAlternativo: contacto.telefonoAlternativo ?? '',
    email: contacto.email ?? '',
    orden: String(contacto.orden),
    palabraClave: contacto.palabraClave ?? '',
    autorizadoCancelar: contacto.autorizadoCancelar,
    notas: contacto.notas ?? '',
  });
  const guardar = useMutation({
    mutationFn: () =>
      editarContacto(contacto.id, {
        nombre: d.nombre,
        rol: d.rol || undefined,
        telefono: d.telefono,
        telefonoAlternativo: d.telefonoAlternativo || undefined,
        email: d.email || undefined,
        orden: Number(d.orden) || 1,
        palabraClave: d.palabraClave || undefined,
        autorizadoCancelar: d.autorizadoCancelar,
        notas: d.notas || undefined,
      }),
    onSuccess: () => {
      alCambiar();
      alCerrar();
    },
  });

  return (
    <Modal titulo={`Editar contacto — ${contacto.nombre}`} alCerrar={alCerrar} ancho="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <div className="grid md:grid-cols-2 gap-3">
          <Campo etiqueta="Nombre" requerido valor={d.nombre} alCambiar={(v) => setD({ ...d, nombre: v })} />
          <Campo etiqueta="Rol (dueño, encargado, vecino…)" valor={d.rol} alCambiar={(v) => setD({ ...d, rol: v })} />
          <Campo etiqueta="Teléfono" requerido valor={d.telefono} alCambiar={(v) => setD({ ...d, telefono: v })} />
          <Campo
            etiqueta="Teléfono alternativo"
            valor={d.telefonoAlternativo}
            alCambiar={(v) => setD({ ...d, telefonoAlternativo: v })}
          />
          <Campo etiqueta="Email" tipo="email" valor={d.email} alCambiar={(v) => setD({ ...d, email: v })} />
          <Campo etiqueta="Orden en la lista" tipo="number" valor={d.orden} alCambiar={(v) => setD({ ...d, orden: v })} />
          <Campo etiqueta="Palabra clave" valor={d.palabraClave} alCambiar={(v) => setD({ ...d, palabraClave: v })} />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={d.autorizadoCancelar}
            onChange={(e) => setD({ ...d, autorizadoCancelar: e.target.checked })}
          />
          Autorizado a cancelar una alarma al verificar con la central
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Notas (disponibilidad, aclaraciones)</span>
          <textarea
            value={d.notas}
            onChange={(e) => setD({ ...d, notas: e.target.value })}
            rows={2}
            className={`${CAMPO} resize-none`}
          />
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
  const [tipo, setTipo] = useState<EstadoPanel['tipo']>('hikvision');
  const [error, setError] = useState<string | null>(null);
  const crear = useMutation({
    mutationFn: () => crearPanel({ sitioId, numeroCuenta, tipo }),
    onSuccess: () => {
      setNumeroCuenta('');
      setError(null);
      alCrear();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo crear el dispositivo'),
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
      <select value={tipo} onChange={(e) => setTipo(e.target.value as EstadoPanel['tipo'])} className={CAMPO}>
        <option value="hikvision">Hikvision</option>
        <option value="ebs">EBS</option>
        <option value="pima">PIMA</option>
        <option value="otro">Otro</option>
      </select>
      <button type="submit" disabled={!numeroCuenta.trim() || crear.isPending} className={BOTON}>
        Agregar dispositivo
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
  const verComo = useMutation({ mutationFn: (id: number) => impersonar(id), onSuccess: iniciarImpersonacion });

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
        <input
          value={datos.nombre}
          onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
          placeholder="Nombre"
          required
          className={CAMPO}
        />
        <input
          value={datos.email}
          onChange={(e) => setDatos({ ...datos, email: e.target.value })}
          type="email"
          placeholder="Email"
          required
          className={CAMPO}
        />
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
  const { data: accesos } = useQuery({ queryKey: ['accesos', usuarioId], queryFn: () => listarAccesos(usuarioId) });
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
        <span
          key={a.id}
          className="flex items-center gap-1 bg-superficie-2 border border-borde rounded-sm px-2 py-0.5 text-xs"
        >
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
            panel: cuenta {nombreCuenta(p.prefijo, p.numeroCuenta)}
          </option>
        ))}
      </select>
      <button onClick={() => agregar.mutate()} disabled={agregar.isPending} className={BOTON_MINI}>
        Dar acceso
      </button>
    </div>
  );
}
