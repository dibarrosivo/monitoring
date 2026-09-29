import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  crearContacto,
  crearHorario,
  crearUsuarioPanel,
  crearZona,
  editarPanel,
  ponerEnPrueba,
  quitarPrueba,
  editarZona,
  eliminarContacto,
  eliminarHorario,
  eliminarUsuarioPanel,
  eliminarZona,
  listarAvisosPush,
  listarEventosDePanel,
  listarHorarios,
  listarPaneles,
  listarUsuariosPanel,
  listarZonas,
  verCliente, listarPlanes } from '../api.js';
import type { EstadoPanel, TipoSenal } from '../tipos.js';
import { fechaHora, transcurrido } from '../tiempo.js';
import { enPrueba } from '../ui.js';
import { Modal } from '../Modal.js';
import { CampoSugerido } from '../CampoSugerido.js';
import { ControlPanel } from '../ControlPanel.js';
import { formatearUsd, NOMBRE_TIPO_SENAL, ORDEN_TIPOS_SENAL } from '@monitoring/shared';
import { CLASES_TIPO, nombreCuenta, NOMBRE_TIPO_PANEL, resumenAviso, tipoDe } from '../ui.js';
import { ModalSenal } from '../ModalSenal.js';

import { BOTON, BOTON_MINI, BOTON_MINI_ROJO, CAMPO } from '../estilos.js';
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

function fechaCorta(iso: string | null | undefined): string {
  return iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';
}

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
  const { data: planes } = useQuery({ queryKey: ['planes'], queryFn: listarPlanes });
  const planActual = planes?.find((p) => p.id === panel?.planId) ?? null;
  const [poniendoEnPrueba, setPoniendoEnPrueba] = useState(false);
  const sacarDePrueba = useMutation({
    mutationFn: () => quitarPrueba(panelId),
    onSuccess: () => void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] }),
  });

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
          <h2 className="font-datos font-semibold text-xl">
            cuenta {nombreCuenta(panel.prefijo, panel.numeroCuenta)}
            {panel.cuentaSecundaria && (
              <span className="text-tenue text-base font-normal"> · también reporta como {panel.cuentaSecundaria}</span>
            )}
          </h2>
          {!panel.activo && <span className="text-prio2 text-xs font-semibold">INACTIVO</span>}
          {enPrueba(panel) && (
            <span className="text-prio2 text-xs font-semibold" title={panel.enPruebaMotivo ?? ''}>
              EN PRUEBA hasta {fechaHora(panel.enPruebaHasta!)}
            </span>
          )}
          <button onClick={() => setEditando(true)} className={BOTON_MINI} title="Editar dispositivo">
            ✎ Editar
          </button>
          <button onClick={() => alternarActivo.mutate()} className={panel.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
            {panel.activo ? 'Desactivar' : 'Reactivar'}
          </button>
          {enPrueba(panel) ? (
            <button onClick={() => sacarDePrueba.mutate()} disabled={sacarDePrueba.isPending} className={BOTON_MINI}>
              Terminar la prueba
            </button>
          ) : (
            <button onClick={() => setPoniendoEnPrueba(true)} className={BOTON_MINI} title="El técnico va a disparar señales: registrar sin abrir alarma">
              Poner en prueba…
            </button>
          )}
          <span className="ml-auto font-datos text-xs text-tenue">
            {panel.ultimaSenalEn ? `última señal ${transcurrido(panel.ultimaSenalEn)}` : 'nunca transmitió'}
          </span>
        </div>
        <p className="text-sm text-tenue mt-1">
          {[panel.alias, panel.tipo, panel.marca, panel.modelo].filter(Boolean).join(' · ')} · prueba cada{' '}
          {panel.intervaloPruebaMin} min
          {!panel.supervisado && ' · sin supervisión'}
          {panel.ventanaCancelacionSeg !== undefined && (panel.ventanaCancelacionSeg > 0 ? ` · robo espera ${panel.ventanaCancelacionSeg} s el desarmado` : ' · sin ventana de cancelación')}
          {panel.propiedad && panel.propiedad !== 'propio' && ` · ${panel.propiedad}`}
        </p>
        <p className="text-sm mt-1 text-tenue">
          {planActual
            ? `Plan ${planActual.nombre} · ${formatearUsd(panel.montoAbono ? Number(panel.montoAbono) : planActual.precioUsd)} cada ${planActual.frecuenciaMeses} ${planActual.frecuenciaMeses === 1 ? 'mes' : 'meses'}`
            : panel.montoAbono
              ? `Abono ${formatearUsd(Number(panel.montoAbono))} cada ${panel.frecuenciaMeses ?? 1} ${(panel.frecuenciaMeses ?? 1) === 1 ? 'mes' : 'meses'}`
              : 'Sin plan de cobro'}
          {panel.proximoVencimiento && ` · próximo período desde el ${fechaCorta(panel.proximoVencimiento)}`}
          {panel.exonerado && <span className="text-ok font-semibold"> · exonerado de cobro</span>}
          {!panel.exonerado && (planActual || panel.montoAbono) && ' · los pagos se registran en Cobros, por cliente'}
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

      <ControlPanel panel={panel} />
      {poniendoEnPrueba && <ModalPonerEnPrueba panelId={panelId} alCerrar={() => setPoniendoEnPrueba(false)} />}

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

      <HistorialSenales panelId={panelId} />

      {editando && <ModalEditarDispositivo panel={panel} alCerrar={() => setEditando(false)} />}
    </div>
  );
}

/**
 * Todo lo que transmitió este equipo, con el mismo código de color de la
 * cola. Las pruebas periódicas se ocultan por defecto porque son la mayoría
 * y no dicen nada; los chips de tipo filtran igual que en la central.
 */
function HistorialSenales({ panelId }: { panelId: number }) {
  const { data: eventos, isLoading } = useQuery({
    queryKey: ['eventos', 'panel', panelId],
    queryFn: () => listarEventosDePanel(panelId, 500),
    refetchInterval: 30_000,
  });
  const [tipo, setTipo] = useState<TipoSenal | null>(null);
  const [conPruebas, setConPruebas] = useState(false);
  const [senalVisible, setSenalVisible] = useState<number | null>(null);

  const todos = eventos ?? [];
  // Rastro de avisos de lo visible (sin pruebas): quién fue avisado y si le llegó
  const idsConAviso = todos.filter((e) => tipoDe(e) !== 'prueba').slice(0, 200).map((e) => e.id);
  const { data: avisos } = useQuery({
    queryKey: ['avisos-push', 'panel', panelId, idsConAviso.length ? idsConAviso[0] : 0],
    queryFn: () => listarAvisosPush(idsConAviso),
    enabled: idsConAviso.length > 0,
    refetchInterval: 30_000,
  });
  const avisosPorEvento = new Map<number, typeof avisos>();
  for (const a of avisos ?? []) avisosPorEvento.set(a.eventoId, [...(avisosPorEvento.get(a.eventoId) ?? []), a]);
  const conteo = new Map<TipoSenal, number>();
  for (const e of todos) conteo.set(tipoDe(e), (conteo.get(tipoDe(e)) ?? 0) + 1);
  const visibles = todos.filter((e) => (tipo ? tipoDe(e) === tipo : conPruebas || tipoDe(e) !== 'prueba'));

  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-tenue text-xs uppercase tracking-wider">Historial de señales</h3>
        <div className="flex items-center gap-1 flex-wrap">
          {ORDEN_TIPOS_SENAL.filter((t) => (conteo.get(t) ?? 0) > 0).map((t) => {
            const activo = tipo === t;
            const c = CLASES_TIPO[t];
            return (
              <button
                key={t}
                onClick={() => setTipo(activo ? null : t)}
                className={`flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-ui ${activo ? `${c.borde} ${c.fondo} ${c.texto} font-semibold` : 'border-borde text-tenue hover:text-texto'}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${c.barra}`} aria-hidden />
                {NOMBRE_TIPO_SENAL[t]} <span className="font-datos">{conteo.get(t)}</span>
              </button>
            );
          })}
        </div>
        {!tipo && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-tenue cursor-pointer">
            <input type="checkbox" checked={conPruebas} onChange={(e) => setConPruebas(e.target.checked)} className="accent-[var(--color-acento)]" />
            Mostrar pruebas periódicas
          </label>
        )}
      </div>
      {isLoading && <p className="text-tenue text-sm">Cargando…</p>}
      <div className="max-h-[28rem] overflow-y-auto border border-borde/60 rounded-sm">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-superficie-2">
            <tr className="text-left text-tenue text-xs uppercase tracking-wider">
              <th className="w-1 p-0" aria-hidden />
              <th className="px-3 py-1.5 font-medium">Hora</th>
              <th className="px-3 py-1.5 font-medium">Código</th>
              <th className="px-3 py-1.5 font-medium">Descripción</th>
              <th className="px-3 py-1.5 font-medium">Usuario / Zona</th>
              <th className="px-3 py-1.5 font-medium">Aviso al cliente</th>
              <th className="px-3 py-1.5" aria-label="Trama" />
            </tr>
          </thead>
          <tbody className="font-datos">
            {visibles.map((e) => {
              const c = CLASES_TIPO[tipoDe(e)];
              return (
                <tr key={e.id} className="border-t border-borde/40">
                  <td className={`p-0 ${c.barra}`} aria-hidden />
                  <td className="px-3 py-1 text-tenue whitespace-nowrap">{fechaHora(e.ocurridoEn)}</td>
                  <td className={`px-3 py-1 font-semibold whitespace-nowrap ${c.texto}`}>{e.codigo}</td>
                  <td className="px-3 py-1 font-ui">{e.descripcion}</td>
                  <td className="px-3 py-1 text-tenue whitespace-nowrap">
                    {e.zona ?? '—'}
                    {e.zonaDescripcion && <span className="font-ui text-texto"> - {e.zonaDescripcion}</span>}
                  </td>
                  <td className="px-3 py-1 font-ui text-xs whitespace-nowrap">
                    {(avisosPorEvento.get(e.id) ?? []).map((a) => {
                      const r = resumenAviso(a);
                      return (
                        <span key={a.id} className={`block ${r.clase}`} title={a.detalle ?? a.voz ?? ''}>
                          {a.usuarioNombre.split(' ')[0]}: {r.texto}
                        </span>
                      );
                    })}
                  </td>
                  <td className="px-3 py-1">
                    {e.senalId && (
                      <button onClick={() => setSenalVisible(e.senalId!)} className="text-tenue hover:text-acento text-xs underline underline-offset-2">
                        trama
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!isLoading && visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-tenue font-ui">
                  {todos.length === 0 ? 'Este equipo todavía no transmitió nada.' : 'Solo hay pruebas periódicas. Márquelas arriba para verlas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {senalVisible !== null && <ModalSenal senalId={senalVisible} alCerrar={() => setSenalVisible(null)} />}
    </section>
  );
}

/** Edición completa del dispositivo en un solo formulario (un solo PUT). */
/**
 * Cuenta en prueba: el técnico está en el sitio y va a disparar de todo. Por
 * las horas indicadas las señales se registran sin abrir alarma ni supervisar
 * silencio u horarios. Vence sola; queda en auditoría quién la puso y por qué.
 */
function ModalPonerEnPrueba({ panelId, alCerrar }: { panelId: number; alCerrar: () => void }) {
  const clienteConsultas = useQueryClient();
  const [horas, setHoras] = useState('2');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const poner = useMutation({
    mutationFn: () => ponerEnPrueba(panelId, { horas: Number(horas), motivo: motivo.trim() }),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
      alCerrar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo poner en prueba'),
  });
  const listo = Number(horas) > 0 && motivo.trim().length > 0;
  return (
    <Modal titulo="Poner la cuenta en prueba" alCerrar={alCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (listo) poner.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <p className="text-tenue">
          Mientras dure, las señales de este dispositivo se registran pero no abren alarma, y no se supervisan el silencio ni los horarios. Termina sola.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-tenue text-xs uppercase tracking-wider">Duración</span>
          <div className="flex gap-1">
            {['1', '2', '4', '8', '24'].map((h) => (
              <button
                type="button"
                key={h}
                onClick={() => setHoras(h)}
                className={`flex-1 rounded-sm border px-2 py-1 text-xs ${horas === h ? 'border-acento bg-acento/15 text-acento font-semibold' : 'border-borde text-tenue hover:text-texto'}`}
              >
                {h} h
              </button>
            ))}
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue text-xs uppercase tracking-wider">Motivo (obligatorio)</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Técnico Frank revisando sensores"
            className={CAMPO}
            autoFocus
          />
        </label>
        {error && <p className="text-prio1">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCerrar} className="text-tenue hover:text-texto">
            Cancelar
          </button>
          <button type="submit" disabled={!listo || poner.isPending} className={BOTON}>
            Poner en prueba {horas} h
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalEditarDispositivo({ panel, alCerrar }: { panel: EstadoPanel; alCerrar: () => void }) {
  const clienteConsultas = useQueryClient();
  const [datos, setDatos] = useState({
    numeroCuenta: panel.numeroCuenta,
    cuentaSecundaria: panel.cuentaSecundaria ?? '',
    prefijo: panel.prefijo ?? '',
    alias: panel.alias ?? '',
    tipo: panel.tipo,
    marca: panel.marca ?? '',
    modelo: panel.modelo ?? '',
    serial: panel.serial ?? '',
    claveMaestra: panel.claveMaestra ?? '',
    instalador: panel.instalador ?? '',
    fechaInstalacion: panel.fechaInstalacion ?? '',
    propiedad: panel.propiedad ?? 'propio',
    supervisado: panel.supervisado,
    intervaloPruebaMin: String(panel.intervaloPruebaMin),
    ventanaCancelacionSeg: String(panel.ventanaCancelacionSeg ?? 25),
    planId: panel.planId ? String(panel.planId) : '',
    exonerado: panel.exonerado ?? false,
    montoAbono: panel.montoAbono ?? '',
    frecuenciaMeses: String(panel.frecuenciaMeses ?? 1),
    proximoVencimiento: panel.proximoVencimiento ?? '',
  });
  const { data: planes } = useQuery({ queryKey: ['planes'], queryFn: listarPlanes });
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      editarPanel(panel.id, {
        numeroCuenta: datos.numeroCuenta,
        cuentaSecundaria: datos.cuentaSecundaria || null,
        prefijo: datos.prefijo || undefined,
        alias: datos.alias || undefined,
        tipo: datos.tipo,
        marca: datos.marca || undefined,
        modelo: datos.modelo || undefined,
        serial: datos.serial || undefined,
        claveMaestra: datos.claveMaestra || undefined,
        instalador: datos.instalador || undefined,
        fechaInstalacion: datos.fechaInstalacion || undefined,
        propiedad: datos.propiedad,
        supervisado: datos.supervisado,
        intervaloPruebaMin: Number(datos.intervaloPruebaMin),
        ventanaCancelacionSeg: Math.max(0, Number(datos.ventanaCancelacionSeg) || 0),
        planId: datos.planId ? Number(datos.planId) : null,
        exonerado: datos.exonerado,
        montoAbono: datos.montoAbono || null,
        frecuenciaMeses: Number(datos.frecuenciaMeses) || 1,
        proximoVencimiento: datos.proximoVencimiento || null,
      }),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
      alCerrar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo guardar'),
  });

  return (
    <Modal titulo={`Editar dispositivo — cuenta ${panel.numeroCuenta}`} alCerrar={alCerrar} ancho="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <div className="grid grid-cols-2 gap-3">
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
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Cuenta secundaria</span>
            <input
              value={datos.cuentaSecundaria}
              onChange={(e) => setDatos({ ...datos, cuentaSecundaria: e.target.value })}
              pattern="[0-9A-Fa-f]{3,16}"
              placeholder="opcional"
              className={`${CAMPO} font-datos`}
            />
            <span className="text-xs text-tenue">
              Si el equipo reporta con otro número por una segunda vía, cargarlo acá para que esas
              señales no entren como cuenta desconocida.
            </span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Prefijo (AL, EBS, HIK…)</span>
            <input value={datos.prefijo} onChange={(e) => setDatos({ ...datos, prefijo: e.target.value })} className={`${CAMPO} font-datos`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Alias del equipo</span>
            <input value={datos.alias} onChange={(e) => setDatos({ ...datos, alias: e.target.value })} className={CAMPO} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Tipo</span>
            <select value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value as typeof datos.tipo })} className={CAMPO}>
              <option value="hikvision">Hikvision</option>
              <option value="ebs">EBS</option>
              <option value="pima">PIMA</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <CampoSugerido
            etiqueta="Marca"
            tipo="marca"
            value={datos.marca}
            onChange={(v) => setDatos({ ...datos, marca: v })}
            className={CAMPO}
          />
          <CampoSugerido
            etiqueta="Modelo"
            tipo="modelo"
            value={datos.modelo}
            onChange={(v) => setDatos({ ...datos, modelo: v })}
            className={CAMPO}
          />
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Serial</span>
            <input value={datos.serial} onChange={(e) => setDatos({ ...datos, serial: e.target.value })} className={`${CAMPO} font-datos`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Clave maestra</span>
            <input value={datos.claveMaestra} onChange={(e) => setDatos({ ...datos, claveMaestra: e.target.value })} className={`${CAMPO} font-datos`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Propiedad del equipo</span>
            <select
              value={datos.propiedad}
              onChange={(e) => setDatos({ ...datos, propiedad: e.target.value as typeof datos.propiedad })}
              className={CAMPO}
            >
              <option value="propio">Del cliente</option>
              <option value="comodato">Comodato</option>
              <option value="prestamo">Préstamo</option>
            </select>
          </label>
          <CampoSugerido
            etiqueta="Instalador"
            tipo="instalador"
            value={datos.instalador}
            onChange={(v) => setDatos({ ...datos, instalador: v })}
            className={CAMPO}
          />
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Fecha de instalación</span>
            <input
              type="date"
              value={datos.fechaInstalacion}
              onChange={(e) => setDatos({ ...datos, fechaInstalacion: e.target.value })}
              className={CAMPO}
            />
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

        <h3 className="text-tenue text-xs uppercase tracking-wider mt-1">Cobro del dispositivo (en dólares)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Plan</span>
            <select value={datos.planId} onChange={(e) => setDatos({ ...datos, planId: e.target.value })} className={CAMPO}>
              <option value="">Sin plan</option>
              {(planes ?? [])
                .filter((p) => p.activo || String(p.id) === datos.planId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {formatearUsd(p.precioUsd)}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tenue">{datos.planId ? 'Precio especial (US$)' : 'Monto (US$)'}</span>
            <input
              value={datos.montoAbono}
              onChange={(e) => setDatos({ ...datos, montoAbono: e.target.value })}
              className={`${CAMPO} font-datos`}
              placeholder={datos.planId ? 'el del plan' : ''}
            />
          </label>
          {!datos.planId && (
            <label className="flex flex-col gap-1">
              <span className="text-tenue">Cada (meses)</span>
              <input type="number" min="1" max="24" value={datos.frecuenciaMeses} onChange={(e) => setDatos({ ...datos, frecuenciaMeses: e.target.value })} className={`${CAMPO} font-datos`} />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-tenue">Próximo período desde</span>
            <input type="date" value={datos.proximoVencimiento} onChange={(e) => setDatos({ ...datos, proximoVencimiento: e.target.value })} className={CAMPO} />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={datos.exonerado} onChange={(e) => setDatos({ ...datos, exonerado: e.target.checked })} />
          Exonerado de cobro (este dispositivo no genera cuotas aunque tenga plan)
        </label>
        <p className="text-xs text-tenue">La cuota se genera sola cuando llega esa fecha y se le avisa al cliente. Los pagos se registran en Cobros, por cliente.</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={datos.supervisado}
            onChange={(e) => setDatos({ ...datos, supervisado: e.target.checked })}
          />
          Supervisado (el silencio genera alarma de sistema)
        </label>
        <label className="flex items-center gap-2">
          <span className="text-tenue">Un robo espera</span>
          <input
            type="number"
            min={0}
            max={300}
            value={datos.ventanaCancelacionSeg}
            onChange={(e) => setDatos({ ...datos, ventanaCancelacionSeg: e.target.value })}
            className={`${CAMPO} w-20`}
          />
          <span className="text-tenue">segundos el desarmado del usuario antes de presentarse (0 = ninguno)</span>
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
