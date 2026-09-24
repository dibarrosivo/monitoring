import type { ReactElement } from 'react';
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
import { AnilloEstado, type EstadoAnillo } from './AnilloEstado.js';
import { IconoCampana, IconoCasa, IconoFlecha, IconoLista, IconoPersona, IconoSos, MarcaFST } from './Iconos.js';
import { SelectorTema } from '../SelectorTema.js';
import { CLASES_TIPO, nombreCuenta, NOMBRE_TIPO_SENAL, tipoDe, VAR_TIPO } from '../ui.js';

type Pestana = 'inicio' | 'avisos' | 'eventos' | 'panico' | 'cuenta';

const PESTANAS: { clave: Pestana; nombre: string; Icono: (p: { className?: string }) => ReactElement }[] = [
  { clave: 'inicio', nombre: 'Inicio', Icono: IconoCasa },
  { clave: 'avisos', nombre: 'Avisos', Icono: IconoCampana },
  { clave: 'eventos', nombre: 'Eventos', Icono: IconoLista },
  { clave: 'panico', nombre: 'Pánico', Icono: IconoSos },
  { clave: 'cuenta', nombre: 'Cuenta', Icono: IconoPersona },
];

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

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
      <header className="px-4 py-2.5 border-b border-borde bg-superficie flex items-center gap-3">
        <span className="flex items-center gap-2.5 min-w-0">
          <MarcaFST tamano={34} className="shrink-0" />
          <span className="leading-none min-w-0">
            <span className="block font-ui font-bold tracking-[-0.01em] text-[15px] truncate">Falcón Seguridad Total</span>
            <span className="block font-datos text-[10px] tracking-[0.18em] text-tenue uppercase mt-0.5">Mi alarma</span>
          </span>
        </span>
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
        <span className="flex-1" />
        <SelectorTema />
        <ControlesAviso
          voz={avisos.voz}
          alternarVoz={avisos.alternarVoz}
          notificaciones={avisos.notificaciones}
          pedirNotificaciones={avisos.pedirNotificaciones}
        />
        <span
          className="hidden sm:flex items-center gap-1.5 font-datos text-[10px] tracking-[0.14em] uppercase text-tenue"
          title={avisos.enlace === 'conectado' ? 'En línea con la central' : 'Sin enlace en tiempo real'}
        >
          <span className={`led ${avisos.enlace === 'conectado' ? 'led-verde' : 'led-rojo'}`} aria-hidden />
          {avisos.enlace === 'conectado' ? 'en línea' : 'sin enlace'}
        </span>
        <span className={`sm:hidden led ${avisos.enlace === 'conectado' ? 'led-verde' : 'led-rojo'}`} aria-hidden />
        {!impersonado && (
          <>
            <button onClick={() => setClaveVisible(true)} className="hidden md:block text-tenue hover:text-texto text-sm">
              Cambiar clave
            </button>
            <button onClick={salir} className="text-tenue hover:text-prio1 text-sm shrink-0">
              Salir
            </button>
          </>
        )}
      </header>

      {(alarmas ?? []).length > 0 && (
        <div className="bg-prio1 text-white px-4 py-2.5 text-sm flex items-start gap-3 alarma-nueva" role="alert">
          <span className="led led-rojo mt-1.5 shrink-0" style={{ background: '#fff', boxShadow: '0 0 8px #fff' }} aria-hidden />
          <span>
            <span className="block font-bold uppercase tracking-wider text-xs">
              {alarmas!.length === 1 ? 'Alarma en curso' : `${alarmas!.length} alarmas en curso`} · la central la está atendiendo
            </span>
            <span className="block">{alarmas![0]!.descripcion}</span>
          </span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4 w-full max-w-5xl mx-auto">
        {pestana === 'inicio' && <InicioCliente nombre={usuario.nombre} paneles={resumen?.paneles} alarmas={alarmas ?? []} alAbrirPanel={setPanelAbierto} />}
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
            aria-current={pestana === p.clave ? 'page' : undefined}
            className={`flex-1 pt-2 pb-2.5 flex flex-col items-center gap-1 font-datos text-[10px] tracking-[0.12em] uppercase ${
              p.clave === 'panico' ? 'text-prio1' : pestana === p.clave ? 'text-acento' : 'text-tenue'
            }`}
          >
            <span className="relative" aria-hidden>
              <p.Icono className={pestana === p.clave ? 'w-6 h-6' : 'w-6 h-6 opacity-80'} />
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

const ESTADO_TEXTO: Record<EstadoAnillo, { titulo: string; clase: string }> = {
  armado: { titulo: 'Protegido', clase: 'text-ok' },
  desarmado: { titulo: 'Desarmado', clase: 'text-prio2' },
  desconocido: { titulo: 'Sin datos', clase: 'text-tenue' },
  alarma: { titulo: 'En alarma', clase: 'text-prio1' },
};

function InicioCliente({
  nombre,
  paneles,
  alarmas,
  alAbrirPanel,
}: {
  nombre: string;
  paneles: PanelResumenCliente[] | undefined;
  alarmas: AlarmaCliente[];
  alAbrirPanel: (id: number) => void;
}) {
  if (!paneles) return <p className="text-tenue">Cargando…</p>;
  if (paneles.length === 0) {
    return (
      <div className="flex flex-col gap-2 max-w-md">
        <h2 className="text-xl font-bold tracking-[-0.02em]">{saludo()}, {nombre.split(' ')[0]}</h2>
        <p className="text-tenue">Su cuenta todavía no tiene un sistema asociado. La central lo vincula cuando el equipo queda instalado.</p>
      </div>
    );
  }

  const protegidos = paneles.filter((p) => p.estadoArmado === 'armado').length;
  const enAlarma = new Set(alarmas.map((a) => a.panelId)).size;
  const resumen =
    enAlarma > 0
      ? `${enAlarma === 1 ? 'una alarma en curso' : `${enAlarma} alarmas en curso`}`
      : paneles.length === 1
        ? paneles[0]!.estadoArmado === 'armado'
          ? 'su sistema está protegido'
          : paneles[0]!.estadoArmado === 'desarmado'
            ? 'su sistema está desarmado'
            : 'sin datos de armado todavía'
        : `${protegidos} de ${paneles.length} sitios protegidos`;

  // Agrupado por cliente; las tarjetas forman grilla en pantallas anchas
  const grupos = [...new Set(paneles.map((p) => p.clienteNombre))];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold tracking-[-0.02em] leading-tight">
          {saludo()}, {nombre.split(' ')[0]}
        </h2>
        <p className={`font-datos text-xs tracking-[0.08em] uppercase mt-1 ${enAlarma > 0 ? 'text-prio1' : 'text-tenue'}`}>{resumen}</p>
      </div>
      {grupos.map((nombreCliente) => (
        <section key={nombreCliente} className="flex flex-col gap-3">
          {grupos.length > 1 && <h3 className="font-datos text-[11px] tracking-[0.14em] uppercase text-tenue">{nombreCliente}</h3>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paneles
              .filter((p) => p.clienteNombre === nombreCliente)
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
  const alarmaAqui = alarmas.find((a) => a.panelId === panel.id);
  const estado: EstadoAnillo = alarmaAqui ? 'alarma' : panel.estadoArmado;
  const e = ESTADO_TEXTO[estado];
  const enLinea = Boolean(panel.ultimaSenalEn && Date.now() - new Date(panel.ultimaSenalEn).getTime() < 26 * 3_600_000);
  return (
    <section
      onClick={alAbrir}
      role={alAbrir ? 'button' : undefined}
      tabIndex={alAbrir ? 0 : undefined}
      onKeyDown={(ev) => {
        if (alAbrir && (ev.key === 'Enter' || ev.key === ' ')) alAbrir();
      }}
      className={`bg-superficie border rounded-2xl p-4 flex gap-4 items-center ${alarmaAqui ? 'border-prio1' : 'border-borde'} ${
        alAbrir ? 'cursor-pointer hover:border-acento focus-visible:border-acento' : ''
      }`}
    >
      <AnilloEstado estado={estado} tamano={84} />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`font-datos text-[11px] tracking-[0.12em] uppercase ${e.clase}`}>{e.titulo}</span>
        <h3 className="font-bold text-lg leading-tight tracking-[-0.01em] truncate">{panel.sitioNombre}</h3>
        {panel.sitioDireccion && <span className="text-tenue text-sm truncate">{panel.sitioDireccion}</span>}
        {alarmaAqui && <span className="text-prio1 text-sm font-semibold">{alarmaAqui.descripcion}</span>}
        <span className="font-datos text-[11px] text-tenue flex flex-wrap gap-x-3 mt-1">
          <span>{nombreCuenta(panel.prefijo, panel.numeroCuenta)}</span>
          <span className={enLinea ? '' : 'text-prio2'}>{panel.ultimaSenalEn ? `señal ${transcurrido(panel.ultimaSenalEn)}` : 'sin señales'}</span>
          {panel.ultimoMovimientoEn && <span>{panel.estadoArmado === 'armado' ? 'armado' : 'desarmado'} {transcurrido(panel.ultimoMovimientoEn)}</span>}
        </span>
      </span>
      {alAbrir && <IconoFlecha className="text-tenue shrink-0" />}
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
