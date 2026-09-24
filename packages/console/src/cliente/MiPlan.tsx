import { useQuery } from '@tanstack/react-query';
import { describirTasa, fechaCorta, formatearBs, formatearUsd, NOMBRE_FORMA_PAGO, usdABs } from '@monitoring/shared';
import { verCobrosCliente } from '../api.js';
import { nombreCuenta } from '../ui.js';

/**
 * Mi plan y mis pagos: lo que el cliente debe, en dólares y en bolívares
 * del día, y sus últimos pagos. Solo lectura por ahora: el reporte de pagos
 * desde la app viene después. Nada de esto afecta el monitoreo.
 */
export function MiPlan() {
  const { data, isLoading } = useQuery({ queryKey: ['cobros-cli'], queryFn: verCobrosCliente, staleTime: 5 * 60_000 });
  if (isLoading || !data) return null;
  const conPlan = data.clientes.filter((c) => c.exonerado || c.dispositivos.length > 0 || c.cuotasPendientes.length > 0 || c.ultimosPagos.length > 0);
  if (conPlan.length === 0) return null;
  const tasa = data.tasa;

  return (
    <section className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-3">
      <h2 className="font-semibold">Mi plan y mis pagos</h2>
      {conPlan.map((c) => (
        <div key={c.clienteId} className="flex flex-col gap-2 text-sm">
          {conPlan.length > 1 && <p className="font-semibold text-tenue">{c.nombre}</p>}
          {c.exonerado && c.pendienteUsd === 0 && (
            <div className="rounded-lg p-3 bg-ok/10 border border-ok/30">
              <p className="text-xs uppercase tracking-wider text-tenue">Estado de cuenta</p>
              <p className="font-semibold text-ok">Servicio exonerado de pago</p>
            </div>
          )}

          {!(c.exonerado && c.pendienteUsd === 0) && (
          <div className={`rounded-lg p-3 ${c.vencidoUsd > 0 ? 'bg-prio2/10 border border-prio2/40' : c.pendienteUsd > 0 ? 'bg-superficie-2' : 'bg-ok/10 border border-ok/30'}`}>
            {c.pendienteUsd > 0 ? (
              <>
                <p className="text-xs uppercase tracking-wider text-tenue">{c.vencidoUsd > 0 ? 'Pago vencido' : 'Próximo pago'}</p>
                <p className="font-datos text-2xl">{formatearUsd(c.pendienteUsd)}</p>
                {c.pendienteBs !== null && tasa && (
                  <p className="text-tenue text-xs">
                    {formatearBs(c.pendienteBs)} hoy · {describirTasa(tasa)}
                  </p>
                )}
                {c.vencidoUsd > 0 && <p className="text-xs mt-1">Su servicio sigue activo. Por favor regularice su pago con la central.</p>}
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wider text-tenue">Estado de cuenta</p>
                <p className="font-semibold text-ok">Al día</p>
                {c.saldoAFavorUsd > 0 && <p className="text-xs text-tenue">Saldo a favor: {formatearUsd(c.saldoAFavorUsd)}</p>}
              </>
            )}
          </div>
          )}

          <ul className="flex flex-col gap-0.5">
            {c.dispositivos.map((d) => (
              <li key={d.panelId} className="flex flex-wrap gap-x-2 text-xs">
                <span className="font-datos">{nombreCuenta(d.prefijo, d.numeroCuenta)}</span>
                <span className="text-tenue truncate">{d.sitioNombre}</span>
                <span className="flex-1" />
                {d.exonerado && <span className="text-ok">exonerado</span>}
                {!d.exonerado && d.precioUsd !== null && (
                  <span>
                    {d.plan ?? 'Plan'} · {formatearUsd(d.precioUsd)}
                    <span className="text-tenue"> cada {d.meses === 1 ? 'mes' : `${d.meses} meses`}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>

          {c.cuotasPendientes.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {c.cuotasPendientes.map((q) => (
                <li key={q.id} className="flex flex-wrap gap-x-2 text-xs">
                  <span>{q.concepto}</span>
                  <span className="text-tenue">{nombreCuenta(q.prefijo, q.numeroCuenta)}</span>
                  <span className="flex-1" />
                  <span className="font-datos">{formatearUsd(q.montoUsd - q.pagadoUsd)}</span>
                  {tasa && <span className="text-tenue">{formatearBs(usdABs(q.montoUsd - q.pagadoUsd, tasa.valor))}</span>}
                  <span className={`w-full text-right ${q.vencida ? 'text-prio2 font-semibold' : 'text-tenue'}`}>
                    {q.vencida ? 'venció' : 'vence'} el {fechaCorta(q.venceEn)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {c.ultimosPagos.length > 0 && (
            <details className="text-xs">
              <summary className="text-tenue cursor-pointer">Últimos pagos</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {c.ultimosPagos.map((p) => (
                  <li key={p.id} className="flex gap-2">
                    <span className="font-datos">{fechaCorta(p.fecha)}</span>
                    <span className="font-datos">{formatearUsd(p.montoUsd)}</span>
                    {p.montoBs !== null && <span className="text-tenue">{formatearBs(p.montoBs)}</span>}
                    <span className="text-tenue">{NOMBRE_FORMA_PAGO[p.forma] ?? p.forma}</span>
                    {p.referencia && <span className="text-tenue">ref. {p.referencia}</span>}
                    {p.estado === 'por_confirmar' && <span className="text-prio2">por confirmar</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!c.exonerado && <p className="text-xs text-tenue">Para reportar un pago, comuníquese con la central. Pronto podrá hacerlo desde aquí.</p>}
        </div>
      ))}
    </section>
  );
}
