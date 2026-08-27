import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buscar } from './api.js';

/**
 * Búsqueda global: clientes, sitios, paneles (por cuenta) y contactos.
 * Elegir un resultado abre la vista Clientes con ese cliente seleccionado.
 */
export function Buscador({ alElegirCliente }: { alElegirCliente: (clienteId: number) => void }) {
  const [termino, setTermino] = useState('');
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Espera breve al tipear para no consultar en cada tecla
  const [terminoEstable, setTerminoEstable] = useState('');
  useEffect(() => {
    const temporizador = setTimeout(() => setTerminoEstable(termino.trim()), 250);
    return () => clearTimeout(temporizador);
  }, [termino]);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['buscar', terminoEstable],
    queryFn: () => buscar(terminoEstable),
    enabled: terminoEstable.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    function alClickearAfuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', alClickearAfuera);
    return () => document.removeEventListener('mousedown', alClickearAfuera);
  }, []);

  function elegir(clienteId: number) {
    setAbierto(false);
    setTermino('');
    alElegirCliente(clienteId);
  }

  const hayResultados =
    resultados &&
    (resultados.clientes.length || resultados.sitios.length || resultados.paneles.length || resultados.contactos.length);

  return (
    <div ref={contenedor} className="relative min-w-0">
      <input
        value={termino}
        onChange={(e) => {
          setTermino(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar cuenta, cliente, contacto…"
        className="w-full bg-fondo border border-borde rounded-sm px-3 py-1 font-ui text-sm placeholder:text-tenue"
        aria-label="Búsqueda global"
      />

      {abierto && terminoEstable.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-superficie border border-borde rounded-sm shadow-xl max-h-96 overflow-y-auto font-ui">
          {!hayResultados && (
            <p className="px-3 py-3 text-sm text-tenue">{isFetching ? 'Buscando…' : 'Sin resultados'}</p>
          )}
          {resultados && resultados.clientes.length > 0 && (
            <Grupo titulo="Clientes">
              {resultados.clientes.map((c) => (
                <Resultado key={c.id} alElegir={() => elegir(c.id)}>
                  <span className="font-semibold">{c.nombre}</span>
                  {c.telefono && <span className="font-datos text-tenue text-xs">{c.telefono}</span>}
                </Resultado>
              ))}
            </Grupo>
          )}
          {resultados && resultados.paneles.length > 0 && (
            <Grupo titulo="Paneles">
              {resultados.paneles.map((p) => (
                <Resultado key={p.id} alElegir={() => elegir(p.clienteId)}>
                  <span className="font-datos font-semibold">cuenta {p.numeroCuenta}</span>
                  <span className="text-tenue text-xs">
                    {p.tipo} · {p.sitioNombre}
                  </span>
                </Resultado>
              ))}
            </Grupo>
          )}
          {resultados && resultados.sitios.length > 0 && (
            <Grupo titulo="Sitios">
              {resultados.sitios.map((s) => (
                <Resultado key={s.id} alElegir={() => elegir(s.clienteId)}>
                  <span className="font-semibold">{s.nombre}</span>
                  {s.direccion && <span className="text-tenue text-xs">{s.direccion}</span>}
                </Resultado>
              ))}
            </Grupo>
          )}
          {resultados && resultados.contactos.length > 0 && (
            <Grupo titulo="Contactos">
              {resultados.contactos.map((c) => (
                <Resultado key={c.id} alElegir={() => elegir(c.clienteId)}>
                  <span className="font-semibold">{c.nombre}</span>
                  <span className="font-datos text-tenue text-xs">{c.telefono}</span>
                </Resultado>
              ))}
            </Grupo>
          )}
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-borde/50 last:border-0">
      <p className="px-3 pt-2 pb-1 text-tenue text-xs uppercase tracking-wider">{titulo}</p>
      {children}
    </div>
  );
}

function Resultado({ alElegir, children }: { alElegir: () => void; children: React.ReactNode }) {
  return (
    <button onClick={alElegir} className="w-full text-left px-3 py-1.5 text-sm hover:bg-superficie-2 flex items-baseline gap-2">
      {children}
    </button>
  );
}
