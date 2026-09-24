import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cerrarSesion, salirImpersonacion, verAlarmasCliente, verEventosCliente, verResumenCliente } from '../api.js';
import type { AlarmaCliente, PanelResumenCliente, Usuario } from '../tipos.js';
import { ModalClave } from '../ModalClave.js';
import { PanicoCliente } from './PanicoCliente.js';
import { AvisosCliente, ControlesAviso, useAvisosCliente } from './Avisos.js';
import { ActualizacionApp } from './ActualizacionApp.js';
import { PanelHikvision } from './PanelHikvision.js';
import { PanelGenerico } from './PanelGenerico.js';
import { HistorialAvisos, useNoLeidos } from './HistorialAvisos.js';
import { CuentaCliente } from './CuentaCliente.js';
import { detenerPush, iniciarPush } from './push.js';
import { SelectorTema } from '../SelectorTema.js';
import { CLASES_TIPO, nombreCuenta, NOMBRE_TIPO_SENAL, tipoDe, VAR_TIPO } from '../ui.js';

type Pestana = 'inicio' | 'avisos' | 'eventos' | 'panico' | 'cuenta';

const PESTANAS: { clave: Pestana; nombre: string; icono: string }[] = [
  { clave: 'inicio', nombre: 'Inicio', icono: '🏠' },
  { clave: 'avisos', nombre: 'Avisos', icono: '🔔' },
  { clave: 'eventos', nombre: 'Eventos', icono: '📋' },
  { clave: 'panico', nombre: 'Pánico', icono: '🆘' },
  { clave: 'cuenta', nombre: 'Cuenta', icono: '👤' },
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
  // Con más de un sitio, los avisos nombran dónde pasó
  const sitios = new Set((resumen?.paneles ?? []).map((p) => p.sitioId)).size;
  const avisos = useAvisosCliente({ nombrarSitio: sitios > 1 });
  const noLeidos = useNoLeidos(resumen?.paneles, pestana === 'avisos');
  // En la app instalada, el teléfono se registra para recibir avisos con la app cerrada
  useEffect(() => {
    if (!impersonado) void iniciarPush(() => setPestana('avisos'));
  }, [impersonado]);
  const salir = () => void detenerPush().finally(cerrarSesion);
  // Cada panel abre su propia pantalla: la Hikvision con control, las demás solo estado
  const [panelAbierto, setPanelAbierto] = useState<number | null>(null);
  const panelElegido = resumen?.paneles.find((p) => p.id === panelAbierto);
  if (panelElegido) {
    return (
      <>
        {panelElegido.tipo === 'hikvision' ? (
          <PanelHikvision panel={panelElegido} alVolver={() => setPanelAbierto(null)} />
        ) : (
          <PanelGenerico panel={panelElegido} alarmas={alarmas ?? []} alVolver={() => setPanelAbierto(null)} />
        )}
        <AvisosCliente avisos={avisos.avisos} alDescartar={avisos.descartar} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-fondo flex flex-col">
      <ActualizacionApp />
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
              {p.clave === 'avisos' && noLeidos > 0 && <Contador n={noLeidos} />}
            </button>
          ))}
        </nav>
        <span className="text-tenue text-sm truncate ml-auto">{usuario.nombre}</span>
        <SelectorTema />
        <ControlesAviso
          voz={avisos.voz}
          alternarVoz={avisos.alternarVoz}
          notificaciones={avisos.notificaciones}
          pedirNotificaciones={avisos.pedirNotificaciones}
        />
        <span
          className={`led ${avisos.enlace === 'conectado' ? 'led-verde' : 'led-rojo'}`}
          title={avisos.enlace === 'conectado' ? 'En línea con la central' : 'Sin enlace en tiempo real'}
          aria-hidden
        />
        {!impersonado && (
          <>
            <button onClick={() => setClaveVisible(true)} className="hidden md:block text-tenue hover:text-texto text-sm">
              Cambiar clave
            </button>
            <button onClick={salir} className="text-tenue hover:text-prio1 text-sm">
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
        {pestana === 'inicio' && <InicioCliente paneles={resumen?.paneles} alarmas={alarmas ?? []} alAbrirPanel={setPanelAbierto} />}
        {pestana === 'avisos' && <HistorialAvisos paneles={resumen?.paneles} />}
        {pestana === 'eventos' && <EventosCliente />}
        {pestana === 'panico' && <PanicoCliente sitios={resumen?.paneles ?? []} />}
        {pestana === 'cuenta' && (
          <CuentaCliente usuario={usuario} paneles={resumen?.paneles ?? []} propietarioDe={resumen?.propietarioDe ?? []} alCambiarClave={() => setClaveVisible(true)} />
        )}
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
            <span className="text-lg leading-none relative" aria-hidden>
              {p.icono}
              {p.clave === 'avisos' && noLeidos > 0 && <Contador n={noLeidos} flotante />}
            </span>
            {p.nombre}
          </button>
        ))}
      </nav>

      <AvisosCliente avisos={avisos.avisos} alDescartar={avisos.descartar} />
      {claveVisible && <ModalClave alCerrar={() => setClaveVisible(false)} />}
    </div>
  );
}

/** Globo con la cantidad de avisos no leídos. */
function Contador({ n, flotante = false }: { n: number; flotante?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-prio1 text-white text-[10px] font-semibold leading-none ${
        flotante ? 'absolute -top-1.5 -right-2.5' : 'ml-1.5 align-middle'
      }`}
    >
      {n > 99 ? '99+' : n}
    </span>
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

function InicioCliente({
  paneles,
  alarmas,
  alAbrirPanel,
}: {
  paneles: PanelResumenCliente[] | undefined;
  alarmas: AlarmaCliente[];
  alAbrirPanel: (id: number) => void;
}) {
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
                <TarjetaSitio key={panel.id} panel={panel} alarmas={alarmas} alAbrir={() => alAbrirPanel(panel.id)} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TarjetaSitio({ panel, alarmas, alAbrir }: { panel: PanelResumenCliente; alarmas: AlarmaCliente[]; alAbrir?: () => void }) {
  const estado = ESTADO_ARMADO[panel.estadoArmado];
  const enAlarma = alarmas.some((a) => a.panelId === panel.id);
  return (
    <section
      onClick={alAbrir}
      role={alAbrir ? 'button' : undefined}
      className={`bg-superficie border rounded-lg p-4 flex flex-col gap-2 ${enAlarma ? 'border-prio1' : 'border-borde'} ${
        alAbrir ? 'cursor-pointer hover:border-acento' : ''
      }`}
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
        <span>cuenta {nombreCuenta(panel.prefijo, panel.numeroCuenta)}</span>
        {panel.ultimoMovimientoEn && <span>último movimiento {transcurrido(panel.ultimoMovimientoEn)}</span>}
        <span>{panel.ultimaSenalEn ? `en línea · señal ${transcurrido(panel.ultimaSenalEn)}` : 'sin señales aún'}</span>
      </div>
      {alAbrir && (
        <p className="text-acento text-xs font-semibold">
          {panel.tipo === 'hikvision' ? 'Abrir el panel: armar, desarmar y ver zonas ›' : 'Abrir el panel: estado, zonas y actividad ›'}
        </p>
      )}
    </section>
  );
}

function EventosCliente() {
  const { data: eventos, isLoading } = useQuery({
    queryKey: ['eventos-cli'],
    queryFn: () => verEventosCliente(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-tenue">Cargando…</p>;
  if ((eventos ?? []).length === 0) return <p className="text-tenue">Sin actividad registrada todavía.</p>;

  return (
    <ul className="flex flex-col gap-2 max-w-2xl">
      {(eventos ?? []).map((evento) => (
        <li key={evento.id} className="bg-superficie border border-borde rounded p-3 border-l-4" style={{ borderLeftColor: VAR_TIPO[tipoDe(evento)] }}>
          <div className="flex items-center gap-2 text-sm">
            <span className={`font-semibold ${CLASES_TIPO[tipoDe(evento)].texto}`}>{NOMBRE_TIPO_SENAL[tipoDe(evento)]}</span>
            <span className={`font-datos text-xs ${CLASES_TIPO[tipoDe(evento)].texto}`}>{evento.codigo}</span>
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
              {['apertura', 'cierre', 'cancelacion'].includes(evento.categoria) ? 'usuario' : 'zona'} {Number(evento.zona) || evento.zona}
              {evento.zonaDescripcion && ` - ${evento.zonaDescripcion}`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
