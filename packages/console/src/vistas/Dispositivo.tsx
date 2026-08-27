import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  crearContacto,
  crearHorario,
  crearUsuarioPanel,
  crearZona,
  editarPanel,
  editarZona,
  eliminarContacto,
  eliminarHorario,
  eliminarUsuarioPanel,
  eliminarZona,
  listarHorarios,
  listarPaneles,
  listarUsuariosPanel,
  listarZonas,
  verCliente,
} from '../api.js';
import type { EstadoPanel } from '../tipos.js';
import { transcurrido } from '../tiempo.js';
import { Modal } from '../Modal.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';
const BOTON_MINI = 'text-xs text-tenue hover:text-acento underline underline-offset-2';
const BOTON_MINI_ROJO = 'text-xs text-tenue hover:text-prio1 underline underline-offset-2';
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

/**
 * Ficha completa del dispositivo: información, zonas, usuarios del teclado,
 * horarios y lista de llamadas — todo el CRUD del equipo en un solo lugar.
 */
export function DetalleDispositivo({
  panelId,
  alVolver,
  alIrACliente,
}: {
  panelId: number;
  alVolver: () => void;
  alIrACliente: (clienteId: number) => void;
}) {
  const clienteConsultas = useQueryClient();
  const { data: paneles } = useQuery({ queryKey: ['paneles'], queryFn: listarPaneles });
  const panel = (paneles ?? []).find((p) => p.id === panelId);
  const [editando, setEditando] = useState(false);

  const alternarActivo = useMutation({
    mutationFn: () => editarPanel(panelId, { activo: !panel?.activo }),
    onSuccess: () => void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] }),
  });

  if (!panel) return <p className="text-tenue">Cargando dispositivo…</p>;

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <button onClick={alVolver} className="self-start text-tenue hover:text-acento text-sm">
        ← Volver a dispositivos
      </button>

      <header className={`bg-superficie border border-borde rounded-sm p-4 ${panel.activo ? '' : 'opacity-60'}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-datos font-semibold text-xl">cuenta {panel.numeroCuenta}</h2>
          {!panel.activo && <span className="text-prio2 text-xs font-semibold">INACTIVO</span>}
          <button onClick={() => setEditando(true)} className={BOTON_MINI} title="Editar dispositivo">
            ✎ Editar
          </button>
          <button onClick={() => alternarActivo.mutate()} className={panel.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
            {panel.activo ? 'Desactivar' : 'Reactivar'}
          </button>
          <span className="ml-auto font-datos text-xs text-tenue">
            {panel.ultimaSenalEn ? `última señal ${transcurrido(panel.ultimaSenalEn)}` : 'nunca transmitió'}
          </span>
        </div>
        <p className="text-sm text-tenue mt-1">
          {[panel.tipo, panel.marca, panel.modelo].filter(Boolean).join(' · ')} · prueba cada {panel.intervaloPruebaMin} min
          {!panel.supervisado && ' · sin supervisión'}
        </p>
        <p className="text-sm mt-1">
          <button
            onClick={() => panel.clienteId && alIrACliente(panel.clienteId)}
            className="text-acento hover:underline underline-offset-2"
          >
            {panel.clienteNombre}
          </button>
          <span className="text-tenue"> · {panel.sitioNombre}</span>
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="bg-superficie border border-borde rounded-sm p-4">
          <Zonas panelId={panelId} />
        </section>
        <section className="bg-superficie border border-borde rounded-sm p-4">
          <UsuariosPanel panelId={panelId} />
        </section>
        <section className="bg-superficie border border-borde rounded-sm p-4">
          <Horarios panelId={panelId} />
        </section>
        {panel.clienteId && (
          <section className="bg-superficie border border-borde rounded-sm p-4">
            <ContactosCliente clienteId={panel.clienteId} sitioId={panel.sitioId} />
          </section>
        )}
      </div>

      {editando && <ModalEditarDispositivo panel={panel} alCerrar={() => setEditando(false)} />}
    </div>
  );
}

/** Edición completa del dispositivo en un solo formulario (un solo PUT). */
function ModalEditarDispositivo({ panel, alCerrar }: { panel: EstadoPanel; alCerrar: () => void }) {
  const clienteConsultas = useQueryClient();
  const [datos, setDatos] = useState({
    numeroCuenta: panel.numeroCuenta,
    tipo: panel.tipo,
    marca: panel.marca ?? '',
    modelo: panel.modelo ?? '',
    supervisado: panel.supervisado,
    intervaloPruebaMin: String(panel.intervaloPruebaMin),
  });
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      editarPanel(panel.id, {
        numeroCuenta: datos.numeroCuenta,
        tipo: datos.tipo,
        marca: datos.marca || undefined,
        modelo: datos.modelo || undefined,
        supervisado: datos.supervisado,
        intervaloPruebaMin: Number(datos.intervaloPruebaMin),
      }),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
      alCerrar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo guardar'),
  });

  return (
    <Modal titulo={`Editar dispositivo — cuenta ${panel.numeroCuenta}`} alCerrar={alCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Número de cuenta</span>
          <input
            value={datos.numeroCuenta}
            onChange={(e) => setDatos({ ...datos, numeroCuenta: e.target.value })}
            required
            pattern="[0-9A-Fa-f]{3,16}"
            className={`${CAMPO} font-datos`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Tipo</span>
            <select value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value as typeof datos.tipo })} className={CAMPO}>
              <option value="hikvision">Hikvision</option>
              <option value="ebm">EBM</option>
              <option value="pima">PIMA</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Marca</span>
            <input value={datos.marca} onChange={(e) => setDatos({ ...datos, marca: e.target.value })} className={CAMPO} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Modelo</span>
            <input value={datos.modelo} onChange={(e) => setDatos({ ...datos, modelo: e.target.value })} className={CAMPO} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Prueba cada (min)</span>
            <input
              type="number"
              min="1"
              value={datos.intervaloPruebaMin}
              onChange={(e) => setDatos({ ...datos, intervaloPruebaMin: e.target.value })}
              className={`${CAMPO} font-datos`}
            />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={datos.supervisado}
            onChange={(e) => setDatos({ ...datos, supervisado: e.target.checked })}
          />
          Supervisado (el silencio genera alarma de sistema)
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

/** Códigos del teclado del panel: con esto los eventos 4xx nombran a la persona. */
function UsuariosPanel({ panelId }: { panelId: number }) {
  const clienteConsultas = useQueryClient();
  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-panel', panelId],
    queryFn: () => listarUsuariosPanel(panelId),
  });
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['usuarios-panel', panelId] });
  const crear = useMutation({
    mutationFn: () => crearUsuarioPanel({ panelId, numero, nombre }),
    onSuccess: () => {
      setNumero('');
      setNombre('');
      setError(null);
      refrescar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo crear'),
  });
  const borrar = useMutation({ mutationFn: eliminarUsuarioPanel, onSuccess: refrescar });

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-tenue text-xs uppercase tracking-wider">Usuarios del panel (códigos)</h4>
      <ul className="text-sm flex flex-col gap-1">
        {(usuarios ?? []).map((u) => (
          <li key={u.id} className="flex gap-2 items-center">
            <span className="font-datos text-tenue">{u.numero}</span>
            <span className="flex-1">{u.nombre}</span>
            <button onClick={() => borrar.mutate(u.id)} className={BOTON_MINI_ROJO}>
              Eliminar
            </button>
          </li>
        ))}
        {(usuarios ?? []).length === 0 && (
          <li className="text-tenue">Sin códigos cargados: los eventos mostrarán solo el número.</li>
        )}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
        className="flex flex-wrap gap-1.5"
      >
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="N°" required pattern="\d{1,4}" className={`${CAMPO} w-16 font-datos`} />
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la persona" required className={`${CAMPO} flex-1`} />
        <button type="submit" disabled={!numero.trim() || !nombre.trim() || crear.isPending} className={BOTON}>
          Agregar
        </button>
        {error && <span className="text-prio1 text-xs">{error}</span>}
      </form>
    </div>
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

/** La lista de llamadas del cliente dueño del dispositivo, con alta rápida. */
function ContactosCliente({ clienteId, sitioId }: { clienteId: number; sitioId: number }) {
  const clienteConsultas = useQueryClient();
  const { data: detalle } = useQuery({ queryKey: ['cliente', clienteId], queryFn: () => verCliente(clienteId) });
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');

  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['cliente', clienteId] });
  const crear = useMutation({
    mutationFn: () => crearContacto({ clienteId, sitioId, nombre, telefono }),
    onSuccess: () => {
      setNombre('');
      setTelefono('');
      refrescar();
    },
  });
  const borrar = useMutation({ mutationFn: eliminarContacto, onSuccess: refrescar });

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-tenue text-xs uppercase tracking-wider">Lista de llamadas (del cliente)</h4>
      <ol className="text-sm flex flex-col gap-1">
        {(detalle?.contactos ?? []).map((c) => (
          <li key={c.id} className="flex gap-2 items-center">
            <span className="font-datos text-tenue">{c.orden}.</span>
            <span className="font-semibold">{c.nombre}</span>
            <span className="font-datos text-acento">{c.telefono}</span>
            {c.palabraClave && <span className="text-tenue text-xs">clave: {c.palabraClave}</span>}
            <button onClick={() => borrar.mutate(c.id)} className={`${BOTON_MINI_ROJO} ml-auto`}>
              Eliminar
            </button>
          </li>
        ))}
        {(detalle?.contactos ?? []).length === 0 && <li className="text-tenue">Sin contactos cargados.</li>}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
        className="flex flex-wrap gap-1.5"
      >
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" required className={`${CAMPO} flex-1`} />
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" required className={CAMPO} />
        <button type="submit" disabled={!nombre.trim() || !telefono.trim() || crear.isPending} className={BOTON}>
          Agregar
        </button>
      </form>
    </div>
  );
}
