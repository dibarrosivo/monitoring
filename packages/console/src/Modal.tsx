/** Cáscara de modal compartida: clic afuera o ✕ para cerrar. */
export function Modal({
  titulo,
  alCerrar,
  children,
  ancho = 'max-w-lg',
}: {
  titulo: string;
  alCerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-fondo/80 flex items-center justify-center p-6" onClick={alCerrar} role="dialog">
      <div
        className={`w-full ${ancho} bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3 max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-tenue text-xs uppercase tracking-wider">{titulo}</h2>
          <button onClick={alCerrar} className="text-tenue hover:text-texto" aria-label="Cerrar">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
