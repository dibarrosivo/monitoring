import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cerrarSesion, salirImpersonacion, verAlarmasCliente, verEventosCliente, verResumenCliente } from '../api.js';
import type { AlarmaCliente, PanelResumenCliente, Usuario } from '../tipos.js';
import { ModalClave } from '../ModalClave.js';
import { PanicoCliente } from './PanicoCliente.js';

type Pestana = 'inicio' | 'eventos' | 'panico';

const PESTANAS: { clave: Pestana; nombre: string; icono: string }[] = [
  { clave: 'inicio', nombre: 'Inicio', icono: '🏠' },
  { clave: 'eventos', nombre: 'Eventos', icono: '📋' },
  { clave: 'panico', nombre: 'Pánico', icono: '🆘' },
];

/**
 * Vista del cliente final: responsiva, la misma en el navegador de escritorio,
 * el teléfono y el envoltorio nativo. Pestañas arriba en pantallas anchas y
 * barra inferior en el teléfono.
 */
export function PantallaCliente({ usuario, impersonado = false }: { usuario: Usuario; impersonado?: boolean }) {
  const [pestana, setPestana] = useState<Pestana>('inicio');
  const [claveVisible, setClaveVisible] = useState(false);
  const { data: resumen } = useQuery({ queryKey: ['resumen-cli'], queryFn: verResumenCliente, refetchInterval: 30_000 });
  const { data: alarmas } = useQuery({ queryKey: ['alarmas-cli'], queryFn: verAlarmasCliente, refetchInterval: 20_000 });

  return (
    <div className="min-h-screen bg-fondo flex flex-col">
      {impersonado && (
        <div className="bg-acento/15 border-b border-acento px-4 py-2 text-sm flex items-center gap-3">
          <span>
            Está viendo la plataforma como <span className="font-semibold">{usuario.nombre}</span> ({usuario.email})
          </span>
          <button
            onClick={salirImpersonacion}
            className="ml-auto shrink-0 border border-acento text-acento rounded-sm px-3 py-1 font-semibold hover:bg-acento/20"
          >
            Volver a la consola
          </button>
        </div>
      )}
      <header className="px-4 py-3 border-b border-borde bg-superficie flex items-center gap-4">
        <span className="font-datos font-semibold tracking-[0.15em] text-sm">MI ALARMA</span>
        {/* Pestañas en línea en pantallas anchas */}
        <nav className="hidden md:flex gap-1">
          {PESTANAS.map((p) => (
            <button
              key={p.clave}
              onClick={() => setPestana(p.clave)}
              className={`px-3 py-1 rounded-sm text-sm ${
                pestana === p.clave ? 'bg-superficie-2 font-semibold' : 'text-tenue hover:text-texto'
              } ${p.clave === 'panico' ? 'text-prio1' : ''}`}
            >
              {p.nombre}
            </button>
          ))}
        </nav>
        <span className="text-tenue text-sm truncate ml-auto">{usuario.nombre}</span>
        {!impersonado && (
          <>
            <button onClick={() => setClaveVisible(true)} className="hidden md:block text-tenue hover:text-texto text-sm">
              Cambiar clave
            </button>
            <button onClick={cerrarSesion} className="text-tenue hover:text-prio1 text-sm">
              Salir
            </button>
          </>
        )}
      </header>

      {(alarmas ?? []).length > 0 && (
        <div className="bg-prio1/20 border-b border-prio1 px-4 py-2.5 text-sm">
          <span className="font-semibold text-prio1">
            {alarmas!.length === 1 ? 'Alarma en curso' : `${alarmas!.length} alarmas en curso`}
          </span>{' '}
          — la central la está atendiendo. {alarmas![0]!.descripcion}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4 w-full max-w-5xl mx-auto">
        {pestana === 'inicio' && <InicioCliente paneles={resumen?.paneles} alarmas={alarmas ?? []} />}
        {pestana === 'eventos' && <EventosCliente />}
        {pestana === 'panico' && <PanicoCliente sitios={resumen?.paneles ?? []} />}
      </main>

      {/* Barra inferior solo en el teléfono */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-superficie border-t border-borde flex">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestana(p.clave)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs ${
              pestana === p.clave ? 'text-acento font-semibold' : 'text-tenue'
            } ${p.clave === 'panico' ? 'text-prio1' : ''}`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {p.icono}
            </span>
            {p.nombre}
          </button>
        ))}
      </nav>

      {claveVisible && <ModalClave alCerrar={() => setClaveVisible(false)} />}
    </div>
  );
}

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

function InicioCliente({ paneles, alarmas }: { paneles: PanelResumenCliente[] | undefined; alarmas: AlarmaCliente[] }) {
  if (!paneles) return <p className="text-tenue">Cargando…</p>;
  if (paneles.length === 0) {
    return <p className="text-tenue">Su cuenta todavía no tiene paneles asociados. Comuníquese con la central.</p>;
  }

  // Agrupado por cliente; las tarjetas forman grilla en pantallas anchas
  const grupos = [...new Set(paneles.map((p) => p.clienteNombre))];

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((nombre) => (
        <section key={nombre} className="flex flex-col gap-2">
          {grupos.length > 1 && <h2 className="text-tenue text-xs uppercase tracking-wider">{nombre}</h2>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paneles
              .filter((p) => p.clienteNombre === nombre)
              .map((panel) => (
                <TarjetaSitio key={panel.id} panel={panel} alarmas={alarmas} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TarjetaSitio({ panel, alarmas }: { panel: PanelResumenCliente; alarmas: AlarmaCliente[] }) {
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

const COLOR_CATEGORIA: Record<string, string> = {
  alarma: 'text-prio1',
  sistema: 'text-prio2',
  averia: 'text-prio2',
  apertura: 'text-acento',
  cierre: 'text-ok',
  restauracion: 'text-ok',
};

const NOMBRE_CAT: Record<string, string> = {
  alarma: 'Alarma',
  restauracion: 'Restauración',
  apertura: 'Apertura',
  cierre: 'Cierre',
  averia: 'Avería',
  anulacion: 'Anulación',
  cancelacion: 'Cancelación',
  sistema: 'Aviso',
  desconocido: 'Evento',
};

function EventosCliente() {
  const { data: eventos, isLoading } = useQuery({
    queryKey: ['eventos-cli'],
    queryFn: verEventosCliente,
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-tenue">Cargando…</p>;
  if ((eventos ?? []).length === 0) return <p className="text-tenue">Sin actividad registrada todavía.</p>;

  return (
    <ul className="flex flex-col gap-2 max-w-2xl">
      {(eventos ?? []).map((evento) => (
        <li key={evento.id} className="bg-superficie border border-borde rounded p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`font-semibold ${COLOR_CATEGORIA[evento.categoria] ?? 'text-tenue'}`}>
              {NOMBRE_CAT[evento.categoria] ?? evento.categoria}
            </span>
            <span className="text-tenue ml-auto font-datos text-xs">
              {new Date(evento.ocurridoEn).toLocaleString('es', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="text-sm mt-0.5">{evento.descripcion}</p>
          {evento.zona && (
            <p className="font-datos text-xs text-tenue mt-0.5">
              zona {evento.zona}
              {evento.zonaDescripcion && ` - ${evento.zonaDescripcion}`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
