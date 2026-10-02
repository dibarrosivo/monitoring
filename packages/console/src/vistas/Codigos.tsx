import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crearUsuarioPanel, listarCodigosSinNombre } from '../api.js';
import type { CodigoSinNombre } from '../tipos.js';
import { fechaHora, transcurrido } from '../tiempo.js';
import { nombreCuenta } from '../ui.js';

/**
 * Códigos de teclado que se están usando y que nadie registró.
 *
 * El panel transmite el número de usuario en cada apertura y cierre. Si ese
 * número no está dado de alta, el operador ve «usr 3» en la cola y el cliente
 * recibe «por usuario 003 desconocido»: sabemos que alguien entró, no quién.
 *
 * Esta pantalla es la lista de llamadas pendientes. Se completa hablando con
 * cada cliente, y cada nombre que se guarda desaparece de acá.
 */

function Fila({ fila, alGuardar }: { fila: CodigoSinNombre; alGuardar: () => void }) {
  const [nombre, setNombre] = useState('');
  const guardar = useMutation({
    mutationFn: () => crearUsuarioPanel({ panelId: fila.panelId, numero: fila.codigo, nombre: nombre.trim() }),
    onSuccess: alGuardar,
  });
  const listo = nombre.trim().length > 0 && !guardar.isPending;

  return (
    <tr className="border-t border-borde/40">
      <td className="px-3 py-1.5 font-datos whitespace-nowrap">
        {nombreCuenta(fila.prefijo, fila.numeroCuenta)}
        <span className="font-ui text-texto"> {fila.clienteNombre}</span>
      </td>
      <td className="px-3 py-1.5 font-ui text-tenue">{fila.sitioNombre}</td>
      <td className="px-3 py-1.5 font-datos font-semibold whitespace-nowrap">usr {fila.codigo}</td>
      <td className="px-3 py-1.5 font-datos text-tenue text-right tabular-nums">{fila.eventos}</td>
      <td className="px-3 py-1.5 font-datos text-tenue whitespace-nowrap" title={fechaHora(fila.ultimoEn)}>
        {transcurrido(fila.ultimoEn, Date.now(), { grueso: true })}
      </td>
      <td className="px-3 py-1.5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (listo) guardar.mutate();
          }}
        >
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="¿Quién es?"
            className="bg-fondo border border-borde rounded-sm px-2 py-1 text-sm font-ui w-48"
          />
          <button
            type="submit"
            disabled={!listo}
            className="border border-acento text-acento rounded-sm px-3 py-1 text-sm font-semibold disabled:opacity-40"
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
        {guardar.isError && <p className="text-prio1 text-xs mt-1">No se pudo guardar. Revise el número.</p>}
      </td>
    </tr>
  );
}

export function Codigos() {
  const clienteConsultas = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['codigos-sin-nombre'], queryFn: listarCodigosSinNombre });
  const refrescar = () => void clienteConsultas.invalidateQueries({ queryKey: ['codigos-sin-nombre'] });

  const filas = data ?? [];
  const cuentas = new Set(filas.map((f) => f.numeroCuenta)).size;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Códigos sin nombre</h2>
        <p className="text-tenue text-sm font-ui max-w-prose">
          Códigos de teclado que se usaron en los últimos 30 días y que nadie dio de alta. Hasta que tengan nombre, el
          operador ve «usr 3» y el cliente recibe «por usuario 003 desconocido».
        </p>
        <p className="text-tenue text-xs font-ui max-w-prose">
          Solo salen cuentas que siguen reportando. No sale el código 000, que es armar sin teclear código de usuario y
          no una persona sin registrar.
        </p>
      </header>

      {isLoading && <p className="text-tenue font-ui">Cargando…</p>}

      {!isLoading && filas.length === 0 && (
        <p className="text-tenue font-ui">
          No hay ninguno: todas las cuentas que reportan tienen nombre para cada código que usan.
        </p>
      )}

      {filas.length > 0 && (
        <>
          <p className="text-tenue font-datos text-xs">
            {filas.length} {filas.length === 1 ? 'código' : 'códigos'} en {cuentas}{' '}
            {cuentas === 1 ? 'cuenta' : 'cuentas'}
          </p>
          <div className="overflow-x-auto border border-borde rounded-lg">
            <table className="w-full text-sm font-datos">
              <thead className="bg-superficie text-tenue text-xs uppercase tracking-wider text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Cuenta</th>
                  <th className="px-3 py-2 font-medium">Sitio</th>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium text-right">Usos</th>
                  <th className="px-3 py-2 font-medium">Último</th>
                  <th className="px-3 py-2 font-medium">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <Fila key={`${f.panelId}-${f.codigo}`} fila={f} alGuardar={refrescar} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
