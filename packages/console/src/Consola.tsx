import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cerrarSesion, listarAlarmas, listarEventos } from './api.js';
import { useTiempoReal } from './tiempoReal.js';
import { sonarAlarma } from './sonido.js';
import type { MensajeTiempoReal, Usuario } from './tipos.js';
import { Cola, type FiltroCola } from './vistas/Cola.js';
import { Tablero } from './vistas/Tablero.js';
import { Eventos } from './vistas/Eventos.js';
import { Paneles } from './vistas/Paneles.js';
import { Clientes } from './vistas/Clientes.js';
import { Usuarios } from './vistas/Usuarios.js';
import { Reportes } from './vistas/Reportes.js';
import { ColaMovil } from './vistas/ColaMovil.js';
import { ModalClave } from './ModalClave.js';
import { HombreMuerto } from './HombreMuerto.js';
import { usePantallaChica } from './pantalla.js';
import { Buscador } from './Buscador.js';

type Vista = 'tablero' | 'cola' | 'eventos' | 'paneles' | 'clientes' | 'reportes' | 'usuarios';

const VISTAS: { clave: Vista; nombre: string; soloAdmin?: boolean }[] = [
  { clave: 'tablero', nombre: 'Dashboard', soloAdmin: true },
  { clave: 'cola', nombre: 'Central de monitoreo' },
  { clave: 'eventos', nombre: 'Señales' },
  { clave: 'paneles', nombre: 'Dispositivos' },
  { clave: 'clientes', nombre: 'Clientes' },
  { clave: 'reportes', nombre: 'Reportes' },
  { clave: 'usuarios', nombre: 'Usuarios', soloAdmin: true },
];

export function Consola({ usuario }: { usuario: Usuario }) {
  const clienteConsultas = useQueryClient();
  const [vista, setVista] = useState<Vista>(usuario.rol === 'admin' ? 'tablero' : 'cola');
  const [reloj, setReloj] = useState(() => new Date());
  const [sonido, setSonido] = useState(() => localStorage.getItem('monitoring.sonido') !== 'no');
  const [claveVisible, setClaveVisible] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const pantallaChica = usePantallaChica();
  // La búsqueda global aterriza en Clientes con el cliente elegido
  const [clienteObjetivo, setClienteObjetivo] = useState<number | null>(null);

  const [dispositivoObjetivo, setDispositivoObjetivo] = useState<number | null>(null);

  function irACliente(clienteId: number) {
    setClienteObjetivo(clienteId);
    setVista('clientes');
    setMenuAbierto(false);
  }

  function irADispositivo(panelId: number) {
    setDispositivoObjetivo(panelId);
    setVista('paneles');
    setMenuAbierto(false);
  }

  /** Navegación directa desde el menú: limpia los objetivos pendientes. */
  function irAVista(destino: Vista) {
    setClienteObjetivo(null);
    setDispositivoObjetivo(null);
    setVista(destino);
    setMenuAbierto(false);
  }

  // Barra de señales interactiva: los contadores filtran la cola o abren el diario
  const [filtroCola, setFiltroCola] = useState<FiltroCola>('abiertas');
  const [solapaEventos, setSolapaEventos] = useState<'eventos' | 'senales'>('eventos');

  function irACola(filtro: FiltroCola) {
    // Repetir el clic sobre el filtro activo vuelve a la vista completa
    setFiltroCola(vista === 'cola' && filtroCola === filtro ? 'abiertas' : filtro);
    setVista('cola');
  }

  function irASenales() {
    setSolapaEventos('senales');
    setVista('eventos');
  }
  const [ultimaSenal, setUltimaSenal] = useState<string | null>(null);
  const [alarmaReciente, setAlarmaReciente] = useState<number | null>(null);

  useEffect(() => {
    const temporizador = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(temporizador);
  }, []);

  function alternarSonido() {
    const nuevo = !sonido;
    setSonido(nuevo);
    localStorage.setItem('monitoring.sonido', nuevo ? 'si' : 'no');
  }

  const enlace = useTiempoReal((mensaje: MensajeTiempoReal) => {
    if (mensaje.canal === 'nuevo_evento') {
      const { codigo, numeroCuenta } = mensaje.carga;
      if (codigo) setUltimaSenal(`${codigo} · cuenta ${numeroCuenta ?? '?'}`);
      void clienteConsultas.invalidateQueries({ queryKey: ['eventos'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['paneles'] });
    }
    if (mensaje.canal === 'nueva_alarma') {
      void clienteConsultas.invalidateQueries({ queryKey: ['alarmas'] });
      if (mensaje.carga.alarmaId) setAlarmaReciente(mensaje.carga.alarmaId);
      if (sonido) sonarAlarma(mensaje.carga.prioridad);
    }
  });

  // El contador de la franja superior sale de la misma consulta que usa la cola.
  const { data: alarmas } = useQuery({ queryKey: ['alarmas'], queryFn: () => listarAlarmas(), refetchInterval: 15_000 });

  // Semilla del ticker: la última señal registrada, hasta que llegue una en vivo.
  const { data: ultimoEvento } = useQuery({
    queryKey: ['ultimo-evento'],
    queryFn: () => listarEventos(1),
    staleTime: Infinity,
  });
  const textoUltimaSenal =
    ultimaSenal ??
    (ultimoEvento?.[0] ? `${ultimoEvento[0].codigo} · cuenta ${ultimoEvento[0].numeroCuenta ?? '?'}` : null);
  const conteos = useMemo(() => {
    const abiertas = alarmas ?? [];
    return {
      nuevas: abiertas.filter((a) => a.estado === 'nueva').length,
      enAtencion: abiertas.filter((a) => a.estado === 'en_atencion').length,
    };
  }, [alarmas]);

  // Disposición para teléfono: encabezado compacto con menú, cola como tarjetas.
  if (pantallaChica) {
    const vistasVisibles = VISTAS.filter((v) => !v.soloAdmin || usuario.rol === 'admin');
    return (
      <div className="min-h-screen bg-fondo flex flex-col">
        <header className="px-3 py-2.5 border-b border-borde bg-superficie flex items-center gap-3 font-datos text-xs sticky top-0 z-30">
          <button onClick={() => setMenuAbierto(!menuAbierto)} aria-label="Menú" className="text-lg leading-none">
            ☰
          </button>
          <span className="font-semibold tracking-[0.1em]">CENTRAL</span>
          <span>
            <span className={conteos.nuevas > 0 ? 'text-prio1 font-semibold' : 'text-tenue'}>{conteos.nuevas}</span>
            <span className="text-tenue"> nuevas</span>
          </span>
          <span className="ml-auto flex items-center gap-3">
            {vista === 'cola' && (
              <button onClick={alternarSonido} aria-label="Sonido de alarmas" className={sonido ? '' : 'opacity-40'}>
                {sonido ? '🔊' : '🔇'}
              </button>
            )}
            <span className={`led ${enlace === 'conectado' ? 'led-verde' : 'led-rojo'}`} aria-hidden />
          </span>
        </header>

        {menuAbierto && (
          <nav className="bg-superficie border-b border-borde flex flex-col text-sm sticky top-10 z-30">
            <div className="p-2">
              <Buscador alElegirCliente={irACliente} />
            </div>
            {vistasVisibles.map((v) => (
              <button
                key={v.clave}
                onClick={() => irAVista(v.clave)}
                className={`text-left px-4 py-2.5 ${vista === v.clave ? 'bg-superficie-2 font-semibold' : 'text-tenue'}`}
              >
                {v.nombre}
              </button>
            ))}
            <div className="border-t border-borde flex items-center gap-3 px-4 py-2.5 font-ui">
              <Avatar nombre={usuario.nombre} />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-texto">{usuario.nombre}</span>
                <span className="block text-tenue text-xs">{NOMBRE_ROL[usuario.rol]}</span>
              </span>
              <span className="ml-auto flex gap-4 text-tenue">
                <button onClick={() => setClaveVisible(true)}>Cambiar clave</button>
                <button onClick={cerrarSesion} className="text-prio1">
                  Salir
                </button>
              </span>
            </div>
          </nav>
        )}

        <main className="flex-1 overflow-y-auto p-3">
          {vista === 'tablero' && (
            <Tablero
              alIrACola={(f) => irACola(f)}
              alIrAPaneles={() => setVista('paneles')}
              alIrASenales={irASenales}
            />
          )}
          {vista === 'cola' && <ColaMovil />}
          {vista === 'eventos' && <Eventos solapaInicial={solapaEventos} />}
          {vista === 'paneles' && <Paneles alIrACliente={irACliente} dispositivoInicial={dispositivoObjetivo} />}
          {vista === 'clientes' && <Clientes clienteInicial={clienteObjetivo} alAbrirDispositivo={irADispositivo} />}
          {vista === 'reportes' && <Reportes />}
          {vista === 'usuarios' && <Usuarios usuarioActualId={usuario.id} />}
        </main>
        {claveVisible && <ModalClave alCerrar={() => setClaveVisible(false)} />}
        <HombreMuerto />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fondo flex">
      {/* Riel de navegación */}
      <nav className="w-52 shrink-0 border-r border-borde bg-superficie flex flex-col">
        <div className="px-4 py-5 border-b border-borde">
          <h1 className="font-datos font-semibold tracking-[0.2em] text-xs">CENTRAL DE MONITOREO</h1>
        </div>
        <div className="flex-1 py-2">
          {VISTAS.filter((v) => !v.soloAdmin || usuario.rol === 'admin').map((v) => (
            <button
              key={v.clave}
              onClick={() => irAVista(v.clave)}
              className={`w-full text-left px-4 py-2.5 text-sm ${
                vista === v.clave ? 'bg-superficie-2 text-texto font-semibold' : 'text-tenue hover:text-texto'
              }`}
            >
              {v.nombre}
              {v.clave === 'cola' && conteos.nuevas > 0 && (
                <span className="ml-2 font-datos text-xs text-prio1">{conteos.nuevas}</span>
              )}
            </button>
          ))}
        </div>
        <PanelUsuario usuario={usuario} alCambiarClave={() => setClaveVisible(true)} />
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Franja de estado estilo receptor: contadores, última señal, reloj, enlace */}
        <header className="border-b border-borde bg-superficie px-5 py-2.5 flex items-center gap-6 font-datos text-xs">
          {vista === 'cola' && (
            <>
          <PestanaSenal
            activa={vista === 'cola' && filtroCola === 'nueva'}
            alElegir={() => irACola('nueva')}
          >
            NUEVAS <span className={conteos.nuevas > 0 ? 'text-prio1 font-semibold' : 'text-tenue'}>{conteos.nuevas}</span>
          </PestanaSenal>
          <PestanaSenal
            activa={vista === 'cola' && filtroCola === 'en_atencion'}
            alElegir={() => irACola('en_atencion')}
          >
            EN ATENCIÓN <span className={conteos.enAtencion > 0 ? 'text-prio2 font-semibold' : 'text-tenue'}>{conteos.enAtencion}</span>
          </PestanaSenal>
          <PestanaSenal activa={vista === 'cola' && filtroCola === 'cerrada'} alElegir={() => irACola('cerrada')}>
            CERRADAS
          </PestanaSenal>
          <PestanaSenal activa={false} alElegir={irASenales}>
            TODAS LAS SEÑALES
          </PestanaSenal>
              <button
                onClick={alternarSonido}
                title={sonido ? 'Silenciar avisos de alarma' : 'Activar avisos de alarma'}
                aria-label="Sonido de alarmas"
                className={`px-1.5 text-base leading-none ${sonido ? '' : 'opacity-40'}`}
              >
                {sonido ? '🔊' : '🔇'}
              </button>
            </>
          )}
          <span className="w-64 shrink-0">
            <Buscador alElegirCliente={irACliente} />
          </span>
          <span className="flex-1 truncate text-tenue">
            {textoUltimaSenal ? (
              <>
                ÚLTIMA SEÑAL <span className="text-texto">{textoUltimaSenal}</span>
              </>
            ) : (
              'SIN SEÑALES REGISTRADAS'
            )}
          </span>
          <span className="text-tenue tabular-nums">{reloj.toLocaleTimeString('es')}</span>
          <span className="flex items-center gap-2">
            <span className={`led ${enlace === 'conectado' ? 'led-verde' : 'led-rojo'}`} aria-hidden />
            <span className={enlace === 'conectado' ? 'text-ok' : 'text-prio1'}>
              {enlace === 'conectado' ? 'EN LÍNEA' : 'SIN ENLACE'}
            </span>
          </span>
        </header>

        {/* La cola es una pantalla de comando: sin scroll de página, la grilla scrollea sola. */}
        <main className={vista === 'cola' ? 'flex-1 min-h-0 p-4 flex flex-col' : 'flex-1 overflow-y-auto p-4'}>
          {vista === 'tablero' && (
            <Tablero
              alIrACola={(f) => irACola(f)}
              alIrAPaneles={() => setVista('paneles')}
              alIrASenales={irASenales}
            />
          )}
          {vista === 'cola' && <Cola alarmaReciente={alarmaReciente} filtro={filtroCola} />}
          {vista === 'eventos' && <Eventos solapaInicial={solapaEventos} />}
          {vista === 'paneles' && <Paneles alIrACliente={irACliente} dispositivoInicial={dispositivoObjetivo} />}
          {vista === 'clientes' && <Clientes clienteInicial={clienteObjetivo} alAbrirDispositivo={irADispositivo} />}
          {vista === 'reportes' && <Reportes />}
          {vista === 'usuarios' && <Usuarios usuarioActualId={usuario.id} />}
        </main>
      </div>
      {claveVisible && <ModalClave alCerrar={() => setClaveVisible(false)} />}
      <HombreMuerto />
    </div>
  );
}

function PestanaSenal({
  activa,
  alElegir,
  children,
}: {
  activa: boolean;
  alElegir: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={alElegir}
      className={`flex items-center gap-1.5 px-2 py-1 -my-1 rounded-sm border-b-2 whitespace-nowrap ${
        activa ? 'border-acento text-texto bg-superficie-2' : 'border-transparent hover:text-texto'
      }`}
    >
      {children}
    </button>
  );
}

const NOMBRE_ROL: Record<Usuario['rol'], string> = {
  admin: 'Administrador',
  operador: 'Operador',
  cliente: 'Cliente',
};

/** Avatar circular con las iniciales, como en FleetView. */
function Avatar({ nombre }: { nombre: string }) {
  const partes = nombre.trim().split(/\s+/);
  const iniciales = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '·';
  return (
    <span className="w-8 h-8 shrink-0 rounded-full grid place-items-center bg-acento/20 text-acento font-bold text-[13px]">
      {iniciales}
    </span>
  );
}

/** Pie del riel: el usuario con su panel desplegable (cambiar clave, salir). */
function PanelUsuario({ usuario, alCambiarClave }: { usuario: Usuario; alCambiarClave: () => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative border-t border-borde">
      {abierto && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-superficie-2 border border-borde rounded-sm shadow-xl flex flex-col text-sm z-40">
          <button
            onClick={() => {
              setAbierto(false);
              alCambiarClave();
            }}
            className="text-left px-3 py-2.5 hover:bg-borde/40"
          >
            Cambiar clave
          </button>
          <button onClick={cerrarSesion} className="text-left px-3 py-2.5 text-prio1 hover:bg-borde/40 border-t border-borde/50">
            Cerrar sesión
          </button>
        </div>
      )}
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-superficie-2/60"
        aria-expanded={abierto}
      >
        <Avatar nombre={usuario.nombre} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{usuario.nombre}</span>
          <span className="block text-tenue text-xs">{NOMBRE_ROL[usuario.rol]}</span>
        </span>
        <span className={`text-tenue text-xs transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden>
          ▲
        </span>
      </button>
    </div>
  );
}
