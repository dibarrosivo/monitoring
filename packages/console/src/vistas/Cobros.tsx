import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describirTasa, fechaCorta, formatearBs, formatearUsd, FORMAS_PAGO, NOMBRE_FORMA_PAGO, situacionCuota, usdABs, type FormaPago } from '@monitoring/shared';
import { anularCuota, anularPago, correrCobros, crearPlan, editarPlan, listarCobros, listarPlanes, registrarPagoCliente, verEstadoDeCuenta, verResumenCobros } from '../api.js';
import type { CuotaVista, EstadoDeCuenta, FilaCobros, PagoVista, Plan } from '../tipos.js';
import { BOTON, BOTON_MINI, BOTON_MINI_ROJO, CAMPO } from '../estilos.js';
import { nombreCuenta } from '../ui.js';

/**
 * Cobros: quién debe, cuánto y desde cuándo; registrar pagos; planes.
 * Todo en dólares, con el equivalente en bolívares a la tasa del día. La
 * mora solo se marca y se avisa: nunca corta el monitoreo.
 */

const hoyIso = () => new Date().toISOString().slice(0, 10);

export function Cobros({ clienteInicial }: { clienteInicial: number | null }) {
  const [elegido, setElegido] = useState<number | null>(clienteInicial);
  const [filtro, setFiltro] = useState('');
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [verPlanes, setVerPlanes] = useState(false);
  const clienteConsultas = useQueryClient();

  useEffect(() => {
    if (clienteInicial !== null) setElegido(clienteInicial);
  }, [clienteInicial]);

  const { data: resumen } = useQuery({ queryKey: ['cobros-resumen'], queryFn: verResumenCobros, refetchInterval: 60_000 });
  const { data: filas, isLoading } = useQuery({ queryKey: ['cobros-clientes'], queryFn: listarCobros, refetchInterval: 60_000 });

  const generar = useMutation({
    mutationFn: correrCobros,
    onSuccess: () => void clienteConsultas.invalidateQueries({ queryKey: ['cobros-clientes'] }).then(() => clienteConsultas.invalidateQueries({ queryKey: ['cobros-resumen'] })),
  });

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (filas ?? [])
      .filter((f) => !soloDeudores || f.pendienteUsd > 0)
      .filter((f) => !q || f.nombre.toLowerCase().includes(q))
      .sort((a, b) => b.vencidoUsd - a.vencidoUsd || b.pendienteUsd - a.pendienteUsd || a.nombre.localeCompare(b.nombre));
  }, [filas, filtro, soloDeudores]);

  return (
    <div className="flex flex-col gap-4">
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Ficha nombre="Clientes en mora" valor={String(resumen.morosos)} alerta={resumen.morosos > 0} />
          <Ficha nombre="Vencido" valor={formatearUsd(resumen.vencidoUsd)} alerta={resumen.vencidoUsd > 0} />
          <Ficha nombre="Pendiente total" valor={formatearUsd(resumen.pendienteUsd)} />
          <Ficha nombre="Por vencer (7 días)" valor={String(resumen.porVencer)} />
          <Ficha nombre="Cobrado este mes" valor={formatearUsd(resumen.cobradoMesUsd)} bien />
          <Ficha nombre="Facturado este mes" valor={formatearUsd(resumen.facturadoMesUsd)} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-tenue text-xs">
          {resumen?.tasa ? `Tasa del día: ${describirTasa(resumen.tasa)}` : 'Sin tasa del BCV cargada: los montos se muestran solo en dólares'}
        </span>
        <span className="flex-1" />
        <button onClick={() => setVerPlanes((v) => !v)} className={BOTON_MINI}>
          {verPlanes ? 'Ocultar planes' : 'Planes'}
        </button>
        <button onClick={() => generar.mutate()} disabled={generar.isPending} className={BOTON_MINI} title="Genera las cuotas cuyo período ya empezó y avisa a los clientes; el servidor lo hace solo cada 6 horas">
          {generar.isPending ? 'Generando…' : 'Generar cuotas ahora'}
        </button>
        {generar.data && (
          <span className="text-xs text-tenue">
            {generar.data.creadas} nuevas · {generar.data.nuevas + generar.data.vencidas} avisos
          </span>
        )}
      </div>

      {verPlanes && <Planes />}

      <div className="grid xl:grid-cols-[minmax(20rem,2fr)_3fr] gap-4 items-start">
        <section className="bg-superficie border border-borde rounded-sm flex flex-col">
          <div className="flex items-center gap-2 p-3 border-b border-borde">
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar cliente" className={`${CAMPO} flex-1`} />
            <label className="flex items-center gap-1.5 text-xs text-tenue whitespace-nowrap">
              <input type="checkbox" checked={soloDeudores} onChange={(e) => setSoloDeudores(e.target.checked)} />
              solo con deuda
            </label>
          </div>
          {isLoading && <p className="p-3 text-tenue text-sm">Cargando…</p>}
          {!isLoading && visibles.length === 0 && <p className="p-3 text-tenue text-sm">Ningún cliente con plan de cobro todavía. Asigne un plan desde la ficha de cada dispositivo.</p>}
          <table className="w-full text-sm">
            <tbody>
              {visibles.map((f) => (
                <FilaCliente key={f.clienteId} fila={f} elegido={f.clienteId === elegido} alElegir={() => setElegido(f.clienteId)} />
              ))}
            </tbody>
          </table>
        </section>

        {elegido !== null ? <EstadoCuenta clienteId={elegido} alCerrar={() => setElegido(null)} /> : <p className="text-tenue text-sm p-3">Elija un cliente para ver su estado de cuenta y registrar pagos.</p>}
      </div>
    </div>
  );
}

function Ficha({ nombre, valor, alerta, bien }: { nombre: string; valor: string; alerta?: boolean; bien?: boolean }) {
  return (
    <div className="bg-superficie border border-borde rounded-sm p-3 flex flex-col gap-1">
      <span className="text-tenue text-xs uppercase tracking-wider">{nombre}</span>
      <span className={`font-datos text-xl ${alerta ? 'text-prio2' : bien ? 'text-ok' : ''}`}>{valor}</span>
    </div>
  );
}

function FilaCliente({ fila: f, elegido, alElegir }: { fila: FilaCobros; elegido: boolean; alElegir: () => void }) {
  return (
    <tr onClick={alElegir} className={`cursor-pointer border-b border-borde/50 last:border-0 ${elegido ? 'bg-acento/10' : 'hover:bg-superficie-2/60'}`}>
      <td className="px-3 py-2">
        <span className="font-semibold">{f.nombre}</span>
        <span className="block text-xs text-tenue">
          {f.dispositivos} {f.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}
          {f.ultimoPago ? ` · último pago ${fechaCorta(f.ultimoPago)}` : ' · sin pagos'}
        </span>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {f.vencidoUsd > 0 ? (
          <span className="text-prio2 font-semibold font-datos">{formatearUsd(f.vencidoUsd)}</span>
        ) : f.pendienteUsd > 0 ? (
          <span className="font-datos">{formatearUsd(f.pendienteUsd)}</span>
        ) : (
          <span className="text-ok text-xs">al día</span>
        )}
        <span className="block text-xs text-tenue">
          {f.cuotasVencidas > 0 ? `${f.cuotasVencidas} vencida${f.cuotasVencidas > 1 ? 's' : ''}` : f.proximaVence ? `vence ${fechaCorta(f.proximaVence)}` : ''}
        </span>
      </td>
    </tr>
  );
}

const CLASE_SITUACION: Record<ReturnType<typeof situacionCuota>, string> = {
  vencida: 'text-prio2 font-semibold',
  pendiente: 'text-prio3',
  pagada: 'text-ok',
  anulada: 'text-tenue line-through',
};

function EstadoCuenta({ clienteId, alCerrar }: { clienteId: number; alCerrar: () => void }) {
  const clienteConsultas = useQueryClient();
  const { data: e, isLoading } = useQuery({ queryKey: ['estado-cuenta', clienteId], queryFn: () => verEstadoDeCuenta(clienteId) });
  const [registrando, setRegistrando] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  const refrescar = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['estado-cuenta', clienteId] });
    void clienteConsultas.invalidateQueries({ queryKey: ['cobros-clientes'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['cobros-resumen'] });
  };
  const anularP = useMutation({ mutationFn: anularPago, onSuccess: refrescar });
  const anularC = useMutation({ mutationFn: anularCuota, onSuccess: refrescar });

  if (isLoading || !e) return <p className="text-tenue text-sm p-3">Cargando estado de cuenta…</p>;
  const hoy = hoyIso();
  const cuotas = verTodas ? e.cuotas : e.cuotas.filter((q) => q.estado === 'pendiente' || q.periodoDesde >= hoy.slice(0, 4) + '-01-01').slice(0, 12);
  const tasa = e.tasa?.valor ?? null;

  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-semibold text-lg">{e.cliente.nombre}</h2>
        <span className="text-sm">
          {e.vencidoUsd > 0 ? (
            <span className="text-prio2 font-semibold">Vencido {formatearUsd(e.vencidoUsd)}</span>
          ) : e.pendienteUsd > 0 ? (
            <span>Pendiente {formatearUsd(e.pendienteUsd)}</span>
          ) : (
            <span className="text-ok">Al día</span>
          )}
          {e.pendienteUsd > 0 && tasa !== null && <span className="text-tenue"> · {formatearBs(usdABs(e.pendienteUsd, tasa))}</span>}
          {e.saldoAFavorUsd > 0 && <span className="text-ok"> · a favor {formatearUsd(e.saldoAFavorUsd)}</span>}
        </span>
        <span className="flex-1" />
        <button onClick={() => setRegistrando(true)} className={BOTON}>
          Registrar pago
        </button>
        <button onClick={alCerrar} className={BOTON_MINI}>
          Cerrar
        </button>
      </div>

      {registrando && <FormularioPago estado={e} alListo={() => setRegistrando(false)} alGuardado={refrescar} />}

      <div>
        <h3 className="text-tenue text-xs uppercase tracking-wider mb-1">Dispositivos</h3>
        {e.dispositivos.length === 0 && <p className="text-tenue text-sm">Sin dispositivos.</p>}
        <ul className="text-sm flex flex-col gap-0.5">
          {e.dispositivos.map((d) => (
            <li key={d.panelId} className="flex flex-wrap gap-x-3">
              <span className="font-datos">{nombreCuenta(d.prefijo, d.numeroCuenta)}</span>
              <span className="text-tenue truncate">{d.sitioNombre}</span>
              <span className="flex-1" />
              {d.precioUsd !== null ? (
                <span>
                  {d.planNombre ?? 'Monto propio'}
                  {d.montoAbono !== null && d.planNombre && <span className="text-tenue"> (precio especial)</span>} · <span className="font-datos">{formatearUsd(d.precioUsd)}</span>
                  <span className="text-tenue"> cada {d.meses} {d.meses === 1 ? 'mes' : 'meses'}</span>
                  {d.proximoVencimiento && <span className="text-tenue"> · próximo {fechaCorta(d.proximoVencimiento)}</span>}
                </span>
              ) : (
                <span className="text-tenue">sin plan de cobro</span>
              )}
              {!d.activo && <span className="text-prio2 text-xs">inactivo</span>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-baseline gap-3 mb-1">
          <h3 className="text-tenue text-xs uppercase tracking-wider">Cuotas</h3>
          {e.cuotas.length > cuotas.length && (
            <button onClick={() => setVerTodas(true)} className={BOTON_MINI}>
              ver todas ({e.cuotas.length})
            </button>
          )}
        </div>
        {cuotas.length === 0 && <p className="text-tenue text-sm">Todavía no se generó ninguna cuota.</p>}
        {cuotas.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-tenue text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-2 py-1 font-normal">Concepto</th>
                <th className="text-left px-2 py-1 font-normal">Cuenta</th>
                <th className="text-left px-2 py-1 font-normal">Vence</th>
                <th className="text-right px-2 py-1 font-normal">Monto</th>
                <th className="text-right px-2 py-1 font-normal">Pagado</th>
                <th className="text-left px-2 py-1 font-normal">Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cuotas.map((q) => (
                <FilaCuota key={q.id} cuota={q} hoy={hoy} alAnular={() => anularC.mutate(q.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h3 className="text-tenue text-xs uppercase tracking-wider mb-1">Pagos</h3>
        {e.pagos.length === 0 && <p className="text-tenue text-sm">Sin pagos registrados.</p>}
        <ul className="text-sm flex flex-col gap-0.5">
          {e.pagos.map((p) => (
            <FilaPago key={p.id} pago={p} alAnular={() => anularP.mutate(p.id)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FilaCuota({ cuota: q, hoy, alAnular }: { cuota: CuotaVista; hoy: string; alAnular: () => void }) {
  const situacion = situacionCuota(q, hoy);
  return (
    <tr className="border-t border-borde/50">
      <td className="px-2 py-1">{q.concepto}</td>
      <td className="px-2 py-1 font-datos text-xs">{nombreCuenta(q.prefijo, q.numeroCuenta)}</td>
      <td className="px-2 py-1 font-datos text-xs">{fechaCorta(q.venceEn)}</td>
      <td className="px-2 py-1 font-datos text-right">{formatearUsd(q.montoUsd)}</td>
      <td className="px-2 py-1 font-datos text-right text-tenue">{q.pagadoUsd > 0 ? formatearUsd(q.pagadoUsd) : ''}</td>
      <td className={`px-2 py-1 text-xs ${CLASE_SITUACION[situacion]}`}>{situacion}</td>
      <td className="px-2 py-1 text-right">
        {situacion !== 'pagada' && situacion !== 'anulada' && q.pagadoUsd === 0 && (
          <button onClick={() => confirm(`¿Anular la cuota "${q.concepto}"?`) && alAnular()} className={BOTON_MINI_ROJO}>
            anular
          </button>
        )}
      </td>
    </tr>
  );
}

function FilaPago({ pago: p, alAnular }: { pago: PagoVista; alAnular: () => void }) {
  return (
    <li className={`flex flex-wrap items-baseline gap-x-3 ${p.estado === 'anulado' ? 'text-tenue line-through' : ''}`}>
      <span className="font-datos text-xs">{fechaCorta(p.fecha)}</span>
      <span className="font-datos">{formatearUsd(p.montoUsd)}</span>
      {p.montoBs !== null && (
        <span className="text-tenue text-xs">
          {formatearBs(p.montoBs)}
          {p.tasa !== null && ` a ${p.tasa.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}
        </span>
      )}
      <span className="text-tenue">{NOMBRE_FORMA_PAGO[p.forma] ?? p.forma}</span>
      {p.referencia && <span className="font-datos text-xs text-tenue">ref. {p.referencia}</span>}
      {p.nota && <span className="text-xs text-tenue">{p.nota}</span>}
      <span className="flex-1" />
      {p.registradoPorNombre && <span className="text-xs text-tenue">por {p.registradoPorNombre}</span>}
      {p.estado === 'por_confirmar' && <span className="text-prio2 text-xs">por confirmar</span>}
      {p.estado === 'confirmado' && (
        <button onClick={() => confirm('¿Anular este pago? Las cuotas que cubría vuelven a quedar pendientes.') && alAnular()} className={BOTON_MINI_ROJO}>
          anular
        </button>
      )}
    </li>
  );
}

/** Registrar un pago: en dólares, o en bolívares con la tasa (por defecto la del día). */
function FormularioPago({ estado: e, alListo, alGuardado }: { estado: EstadoDeCuenta; alListo: () => void; alGuardado: () => void }) {
  const [moneda, setMoneda] = useState<'USD' | 'BS'>(e.tasa ? 'BS' : 'USD');
  const [monto, setMonto] = useState('');
  const [tasa, setTasa] = useState(e.tasa ? String(e.tasa.valor) : '');
  const [forma, setForma] = useState<FormaPago>('pago_movil');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  const montoNum = Number(monto.replace(',', '.'));
  const tasaNum = Number(tasa.replace(',', '.'));
  const equivalente = moneda === 'BS' && montoNum > 0 && tasaNum > 0 ? montoNum / tasaNum : moneda === 'USD' && montoNum > 0 && tasaNum > 0 ? usdABs(montoNum, tasaNum) : null;

  const guardar = useMutation({
    mutationFn: () =>
      registrarPagoCliente(e.cliente.id, {
        ...(moneda === 'USD' ? { montoUsd: montoNum, ...(tasaNum > 0 ? { tasa: tasaNum } : {}) } : { montoBs: montoNum, tasa: tasaNum }),
        forma,
        referencia: referencia || null,
        fecha,
        nota: nota || null,
      }),
    onSuccess: () => {
      alGuardado();
      alListo();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo registrar el pago'),
  });

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        setError(null);
        if (!(montoNum > 0)) return setError('Indique el monto');
        if (moneda === 'BS' && !(tasaNum > 0)) return setError('Indique la tasa para llevar los bolívares a dólares');
        guardar.mutate();
      }}
      className="bg-superficie-2/50 border border-borde rounded-sm p-3 flex flex-col gap-3 text-sm"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Monto en</span>
          <select value={moneda} onChange={(ev) => setMoneda(ev.target.value as 'USD' | 'BS')} className={CAMPO}>
            <option value="BS">Bolívares</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">{moneda === 'BS' ? 'Monto (Bs)' : 'Monto (US$)'}</span>
          <input value={monto} onChange={(ev) => setMonto(ev.target.value)} className={`${CAMPO} font-datos`} autoFocus inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Tasa (Bs por US$)</span>
          <input value={tasa} onChange={(ev) => setTasa(ev.target.value)} className={`${CAMPO} font-datos`} inputMode="decimal" placeholder={moneda === 'USD' ? 'opcional' : ''} />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-tenue">Equivale a</span>
          <span className="font-datos py-1.5">{equivalente !== null ? (moneda === 'BS' ? formatearUsd(Math.round(equivalente * 100) / 100) : formatearBs(equivalente)) : '—'}</span>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Forma</span>
          <select value={forma} onChange={(ev) => setForma(ev.target.value as FormaPago)} className={CAMPO}>
            {FORMAS_PAGO.map((f) => (
              <option key={f} value={f}>
                {NOMBRE_FORMA_PAGO[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Referencia</span>
          <input value={referencia} onChange={(ev) => setReferencia(ev.target.value)} className={`${CAMPO} font-datos`} placeholder="últimos dígitos" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Fecha del pago</span>
          <input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Nota</span>
          <input value={nota} onChange={(ev) => setNota(ev.target.value)} className={CAMPO} />
        </label>
      </div>
      <p className="text-xs text-tenue">Se aplica a las cuotas más viejas primero; lo que sobre queda a favor del cliente para la próxima.</p>
      {error && <p className="text-prio1 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={guardar.isPending} className={BOTON}>
          {guardar.isPending ? 'Guardando…' : 'Guardar pago'}
        </button>
        <button type="button" onClick={alListo} className={BOTON_MINI}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Planes: nombre, precio en dólares y frecuencia. Se desactivan, no se borran (los dispositivos los referencian). */
function Planes() {
  const clienteConsultas = useQueryClient();
  const { data: planes } = useQuery({ queryKey: ['planes'], queryFn: listarPlanes });
  const [nuevo, setNuevo] = useState({ nombre: '', precioUsd: '', frecuenciaMeses: '1', descripcion: '' });
  const [error, setError] = useState<string | null>(null);
  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['planes'] });
  const crear = useMutation({
    mutationFn: () => crearPlan({ nombre: nuevo.nombre.trim(), precioUsd: Number(nuevo.precioUsd.replace(',', '.')), frecuenciaMeses: Number(nuevo.frecuenciaMeses) || 1, descripcion: nuevo.descripcion || null }),
    onSuccess: () => {
      setNuevo({ nombre: '', precioUsd: '', frecuenciaMeses: '1', descripcion: '' });
      refrescar();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo crear el plan'),
  });
  const cambiar = useMutation({ mutationFn: ({ id, datos }: { id: number; datos: Partial<Plan> }) => editarPlan(id, datos), onSuccess: refrescar });

  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3 text-sm">
      <h2 className="text-tenue text-xs uppercase tracking-wider">Planes (precio en dólares por período)</h2>
      {(planes ?? []).length === 0 && <p className="text-tenue">Sin planes. Cree el primero abajo y asígnelo desde la ficha de cada dispositivo.</p>}
      <ul className="flex flex-col gap-1">
        {(planes ?? []).map((p) => (
          <li key={p.id} className={`flex flex-wrap items-baseline gap-x-3 ${p.activo ? '' : 'text-tenue'}`}>
            <span className="font-semibold">{p.nombre}</span>
            <span className="font-datos">{formatearUsd(p.precioUsd)}</span>
            <span className="text-tenue">
              cada {p.frecuenciaMeses} {p.frecuenciaMeses === 1 ? 'mes' : 'meses'}
            </span>
            {p.descripcion && <span className="text-tenue text-xs">{p.descripcion}</span>}
            <span className="flex-1" />
            <button
              onClick={() => {
                const v = prompt(`Nuevo precio en dólares de "${p.nombre}"`, String(p.precioUsd));
                if (v !== null && Number(v.replace(',', '.')) >= 0) cambiar.mutate({ id: p.id, datos: { precioUsd: Number(v.replace(',', '.')) } });
              }}
              className={BOTON_MINI}
            >
              cambiar precio
            </button>
            <button onClick={() => cambiar.mutate({ id: p.id, datos: { activo: !p.activo } })} className={p.activo ? BOTON_MINI_ROJO : BOTON_MINI}>
              {p.activo ? 'desactivar' : 'reactivar'}
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          setError(null);
          if (!nuevo.nombre.trim() || !(Number(nuevo.precioUsd.replace(',', '.')) >= 0)) return setError('Nombre y precio son obligatorios');
          crear.mutate();
        }}
        className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end"
      >
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Nombre</span>
          <input value={nuevo.nombre} onChange={(ev) => setNuevo({ ...nuevo, nombre: ev.target.value })} className={CAMPO} placeholder="Residencial" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Precio (US$)</span>
          <input value={nuevo.precioUsd} onChange={(ev) => setNuevo({ ...nuevo, precioUsd: ev.target.value })} className={`${CAMPO} font-datos`} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Cada (meses)</span>
          <input type="number" min="1" max="24" value={nuevo.frecuenciaMeses} onChange={(ev) => setNuevo({ ...nuevo, frecuenciaMeses: ev.target.value })} className={`${CAMPO} font-datos`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tenue">Descripción</span>
          <input value={nuevo.descripcion} onChange={(ev) => setNuevo({ ...nuevo, descripcion: ev.target.value })} className={CAMPO} placeholder="qué incluye" />
        </label>
        <button type="submit" disabled={crear.isPending} className={BOTON}>
          Crear plan
        </button>
      </form>
      {error && <p className="text-prio1 text-xs">{error}</p>}
    </section>
  );
}
