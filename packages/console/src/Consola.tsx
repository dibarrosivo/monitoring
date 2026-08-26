import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cerrarSesion, listarAlarmas, listarEventos } from './api.js';
import { useTiempoReal } from './tiempoReal.js';
import { sonarAlarma } from './sonido.js';
import type { MensajeTiempoReal, Usuario } from './tipos.js';
import { Cola } from './vistas/Cola.js';
import { Eventos } from './vistas/Eventos.js';
import { Paneles } from './vistas/Paneles.js';
import { Clientes } from './vistas/Clientes.js';
import { Usuarios } from './vistas/Usuarios.js';
import { ModalClave } from './ModalClave.js';

type Vista = 'cola' | 'eventos' | 'paneles' | 'clientes' | 'usuarios';

const VISTAS: { clave: Vista; nombre: string; soloAdmin?: boolean }[] = [
  { clave: 'cola', nombre: 'Cola de alarmas' },
  { clave: 'eventos', nombre: 'Eventos' },
  { clave: 'paneles', nombre: 'Paneles' },
  { clave: 'clientes', nombre: 'Clientes' },
  { clave: 'usuarios', nombre: 'Usuarios', soloAdmin: true },
];

export function Consola({ usuario }: { usuario: Usuario }) {
  const clienteConsultas = useQueryClient();
  const [vista, setVista] = useState<Vista>('cola');
  const [reloj, setReloj] = useState(() => new Date());
  const [sonido, setSonido] = useState(() => localStorage.getItem('monitoring.sonido') !== 'no');
  const [claveVisible, setClaveVisible] = useState(false);
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
  const { data: alarmas } = useQuery({ queryKey: ['alarmas'], queryFn: listarAlarmas, refetchInterval: 15_000 });

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
              onClick={() => setVista(v.clave)}
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
        <div className="px-4 py-4 border-t border-borde text-sm flex flex-col gap-2">
          <button onClick={alternarSonido} className="text-left text-tenue hover:text-texto">
            Sonido: {sonido ? 'activado' : 'silenciado'}
          </button>
          <div className="text-tenue truncate" title={usuario.email}>
            {usuario.nombre}
          </div>
          <button onClick={() => setClaveVisible(true)} className="text-left text-tenue hover:text-texto">
            Cambiar clave
          </button>
          <button onClick={cerrarSesion} className="text-left text-tenue hover:text-prio1">
            Cerrar sesión
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Franja de estado estilo receptor: contadores, última señal, reloj, enlace */}
        <header className="border-b border-borde bg-superficie px-5 py-2.5 flex items-center gap-6 font-datos text-xs">
          <span>
            NUEVAS <span className={conteos.nuevas > 0 ? 'text-prio1 font-semibold' : 'text-tenue'}>{conteos.nuevas}</span>
          </span>
          <span>
            EN ATENCIÓN <span className={conteos.enAtencion > 0 ? 'text-prio2 font-semibold' : 'text-tenue'}>{conteos.enAtencion}</span>
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
          {vista === 'cola' && <Cola alarmaReciente={alarmaReciente} />}
          {vista === 'eventos' && <Eventos />}
          {vista === 'paneles' && <Paneles />}
          {vista === 'clientes' && <Clientes />}
          {vista === 'usuarios' && <Usuarios usuarioActualId={usuario.id} />}
        </main>
      </div>
      {claveVisible && <ModalClave alCerrar={() => setClaveVisible(false)} />}
    </div>
  );
}
