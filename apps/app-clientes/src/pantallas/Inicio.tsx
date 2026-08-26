import type { AlarmaApp, PanelResumen, Resumen } from '../api.js';

function transcurrido(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

const ESTADO_ARMADO = {
  armado: { texto: 'Armado', clase: 'text-ok', icono: '🔒' },
  desarmado: { texto: 'Desarmado', clase: 'text-prio2', icono: '🔓' },
  desconocido: { texto: 'Sin datos', clase: 'text-tenue', icono: '❔' },
} as const;

export function Inicio({ resumen, alarmas }: { resumen: Resumen | undefined; alarmas: AlarmaApp[] }) {
  if (!resumen) return <p className="text-tenue">Cargando…</p>;

  if (resumen.paneles.length === 0) {
    return <p className="text-tenue">Tu cuenta todavía no tiene paneles asociados. Comunicate con la central.</p>;
  }

  // Con acceso a más de un cliente, los sitios se agrupan bajo el nombre de cada uno
  const variosClientes = new Set(resumen.paneles.map((p) => p.clienteNombre)).size > 1;

  return (
    <div className="flex flex-col gap-3">
      {resumen.paneles.map((panel, indice) => {
        const primeroDelCliente =
          resumen.paneles.findIndex((p) => p.clienteNombre === panel.clienteNombre) === indice;
        return (
          <div key={panel.id} className="flex flex-col gap-2">
            {variosClientes && primeroDelCliente && (
              <h2 className="text-tenue text-xs uppercase tracking-wider mt-1">{panel.clienteNombre}</h2>
            )}
            <TarjetaSitio panel={panel} alarmas={alarmas} />
          </div>
        );
      })}
    </div>
  );
}

function TarjetaSitio({ panel, alarmas }: { panel: PanelResumen; alarmas: AlarmaApp[] }) {
  const estado = ESTADO_ARMADO[panel.estadoArmado];
  const enAlarma = alarmas.some((a) => a.panelId === panel.id);
  return (
    <section
      className={`bg-superficie border rounded-lg p-4 flex flex-col gap-2 ${enAlarma ? 'border-prio1' : 'border-borde'}`}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-lg flex-1 truncate">{panel.sitioNombre}</h3>
        <span className={`flex items-center gap-1.5 font-semibold ${estado.clase}`}>
          <span aria-hidden>{estado.icono}</span>
          {estado.texto}
        </span>
      </div>
      {panel.sitioDireccion && <p className="text-tenue text-sm">{panel.sitioDireccion}</p>}
      {enAlarma && <p className="text-prio1 text-sm font-semibold">⚠ Alarma en curso en este sitio</p>}
      <div className="font-datos text-xs text-tenue flex flex-wrap gap-x-4">
        <span>cuenta {panel.numeroCuenta}</span>
        {panel.ultimoMovimientoEn && <span>último movimiento {transcurrido(panel.ultimoMovimientoEn)}</span>}
        <span>{panel.ultimaSenalEn ? `en línea · señal ${transcurrido(panel.ultimaSenalEn)}` : 'sin señales aún'}</span>
      </div>
    </section>
  );
}
