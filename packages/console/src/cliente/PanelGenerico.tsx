import { useQuery } from '@tanstack/react-query';
import { verEventosCliente, verZonasCliente } from '../api.js';
import type { AlarmaCliente, PanelResumenCliente } from '../tipos.js';
import { COLOR_TIPO_CLARO, nombreCuenta, NOMBRE_TIPO_PANEL, tipoDe } from '../ui.js';

/**
 * La pantalla del panel para equipos que no se controlan desde la app
 * (PIMA, EBS y otros): el mismo estilo claro que la pantalla Hikvision, con
 * lo que la central sabe del equipo. Se arma y desarma desde el teclado del
 * panel; acá se ve el estado, las zonas y lo que pasó.
 */

const ESTADO = {
  armado: { titulo: 'Armado', frase: 'El sistema está vigilando.', color: '#1E6EF0', fondo: '#E7F0FE', icono: '🔒' },
  desarmado: { titulo: 'Desarmado', frase: 'El sistema no está vigilando.', color: '#6B7280', fondo: '#F1F3F6', icono: '🔓' },
  desconocido: { titulo: 'Sin datos', frase: 'La central todavía no recibió un armado o desarmado.', color: '#6B7280', fondo: '#F1F3F6', icono: '❔' },
} as const;

const TARJETA = { background: '#FFFFFF', boxShadow: '0 1px 3px rgb(21 33 46 / 0.06)' } as const;

function hace(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function PanelGenerico({ panel, alarmas, alVolver }: { panel: PanelResumenCliente; alarmas: AlarmaCliente[]; alVolver: () => void }) {
  const { data: zonas } = useQuery({ queryKey: ['zonas-cli', panel.id], queryFn: () => verZonasCliente(panel.id), staleTime: 300_000 });
  const { data: eventos } = useQuery({ queryKey: ['eventos-cli', panel.id], queryFn: () => verEventosCliente(panel.id), refetchInterval: 30_000 });
  const enAlarma = alarmas.filter((a) => a.panelId === panel.id);
  const e = ESTADO[panel.estadoArmado];
  // En línea si transmitió en las últimas 26 h (una prueba diaria es lo habitual)
  const enLinea = Boolean(panel.ultimaSenalEn && Date.now() - new Date(panel.ultimaSenalEn).getTime() < 26 * 3_600_000);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F2F4F7', color: '#15212E' }}>
      <header className="px-4 py-3 flex items-center gap-3" style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8EF' }}>
        <button onClick={alVolver} aria-label="Volver" className="text-2xl leading-none px-1" style={{ color: '#1E6EF0' }}>
          ‹
        </button>
        <div className="min-w-0">
          <h1 className="font-semibold text-base truncate">{panel.sitioNombre}</h1>
          <p className="text-xs truncate" style={{ color: '#6B7280' }}>
            {NOMBRE_TIPO_PANEL[panel.tipo] ?? 'Panel'} {nombreCuenta(panel.prefijo, panel.numeroCuenta)}
            {enLinea && ' · en línea'}
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto p-4 flex flex-col gap-4 pb-24">
        <section className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center" style={TARJETA}>
          <div
            className="w-40 h-40 rounded-full flex flex-col items-center justify-center"
            style={{ background: enAlarma.length ? '#FDECEA' : e.fondo, border: `6px solid ${enAlarma.length ? '#D93025' : e.color}` }}
          >
            <span className="text-4xl" aria-hidden>
              {enAlarma.length ? '🚨' : e.icono}
            </span>
            <span className="font-semibold mt-1" style={{ color: enAlarma.length ? '#D93025' : e.color }}>
              {enAlarma.length ? 'EN ALARMA' : e.titulo}
            </span>
          </div>
          <p className="text-sm" style={{ color: '#6B7280' }}>
            {enAlarma.length ? `La central está atendiendo: ${enAlarma[0]!.descripcion}` : e.frase}
            {!enAlarma.length && panel.ultimoMovimientoEn && ` Desde el ${horaCorta(panel.ultimoMovimientoEn)}.`}
          </p>
          <p className="text-xs" style={{ color: '#6B7280' }}>
            Este panel se arma y se desarma desde su teclado.
          </p>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <Chip titulo="Conexión" valor={panel.ultimaSenalEn ? (enLinea ? 'En línea' : 'Sin señal') : 'Sin señal'} bien={enLinea} detalle={panel.ultimaSenalEn ? `señal ${hace(panel.ultimaSenalEn)}` : 'nunca transmitió'} />
          <Chip titulo="Movimiento" valor={panel.ultimoMovimientoEn ? hace(panel.ultimoMovimientoEn) : '—'} bien detalle={panel.estadoArmado === 'armado' ? 'armado' : panel.estadoArmado === 'desarmado' ? 'desarmado' : ''} />
          <Chip titulo="Zonas" valor={zonas ? String(zonas.length) : '…'} bien detalle="con descripción" />
        </section>

        {zonas && zonas.length > 0 && (
          <section className="rounded-2xl overflow-hidden" style={TARJETA}>
            <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold" style={{ color: '#6B7280' }}>
              Zonas
            </h2>
            <ul>
              {zonas.map((z) => (
                <li key={z.numero} className="px-4 py-2.5 flex items-center gap-3" style={{ borderTop: '1px solid #EEF1F5' }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums" style={{ background: '#F1F3F6', color: '#6B7280' }}>
                    {Number(z.numero)}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{z.descripcion ?? `Zona ${Number(z.numero)}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl overflow-hidden" style={TARJETA}>
          <h2 className="px-4 pt-3 pb-2 text-xs uppercase tracking-wider font-semibold" style={{ color: '#6B7280' }}>
            Actividad reciente
          </h2>
          <ul>
            {(eventos ?? []).slice(0, 20).map((ev) => (
              <li key={ev.id} className="px-4 py-2.5 flex items-start gap-3 text-sm" style={{ borderTop: '1px solid #EEF1F5' }}>
                <span className="text-xs whitespace-nowrap pt-0.5 tabular-nums" style={{ color: '#6B7280' }}>
                  {horaCorta(ev.ocurridoEn)}
                </span>
                <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: COLOR_TIPO_CLARO[tipoDe(ev)] }} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ color: tipoDe(ev) === 'emergencia' || tipoDe(ev) === 'robo' ? COLOR_TIPO_CLARO[tipoDe(ev)] : '#15212E', fontWeight: tipoDe(ev) === 'emergencia' || tipoDe(ev) === 'robo' ? 600 : 400 }}>
                    {ev.descripcion}
                  </span>
                  {ev.zona && (
                    <span className="block text-xs" style={{ color: '#6B7280' }}>
                      {['apertura', 'cierre', 'cancelacion'].includes(ev.categoria) ? 'usuario' : 'zona'} {Number(ev.zona) || ev.zona}
                      {ev.zonaDescripcion && ` · ${ev.zonaDescripcion}`}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {(eventos ?? []).length === 0 && (
              <li className="px-4 py-3 text-sm" style={{ color: '#6B7280' }}>
                Sin actividad registrada todavía.
              </li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}

function Chip({ titulo, valor, bien, detalle }: { titulo: string; valor: string; bien: boolean; detalle?: string }) {
  return (
    <div className="rounded-2xl px-3 py-3 flex flex-col items-center text-center" style={TARJETA}>
      <span className="text-xs" style={{ color: '#6B7280' }}>
        {titulo}
      </span>
      <span className="font-semibold text-sm mt-0.5" style={{ color: bien ? '#15212E' : '#D93025' }}>
        {valor}
      </span>
      {detalle && (
        <span className="text-xs mt-0.5 truncate max-w-full" style={{ color: '#6B7280' }}>
          {detalle}
        </span>
      )}
    </div>
  );
}
