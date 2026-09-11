import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enviarComando, listarComandos } from './api.js';
import { fechaHora } from './tiempo.js';
import type { AccionComando, EstadoPanel } from './tipos.js';

/**
 * Control remoto del equipo: armar, armar en casa, desarmar.
 *
 * Solo se muestra en los equipos que lo admiten. Un botón deshabilitado invita
 * a preguntar por qué no funciona; uno ausente no genera la expectativa.
 *
 * Desarmar deja un sitio sin protección, así que pide confirmación explícita.
 * Las otras dos acciones no la piden: equivocarse armando no tiene costo.
 */

const ACCIONES: { valor: AccionComando; etiqueta: string; peligrosa?: boolean }[] = [
  { valor: 'armar', etiqueta: 'Armar' },
  { valor: 'armar_casa', etiqueta: 'Armar en casa' },
  { valor: 'desarmar', etiqueta: 'Desarmar', peligrosa: true },
];

const NOMBRE_ESTADO: Record<string, string> = {
  pendiente: 'enviando',
  enviado: 'esperando confirmación del panel',
  confirmado: 'confirmado por el panel',
  fallido: 'falló',
};

/** Tipos de equipo con canal de vuelta. El resto reporta en un solo sentido. */
const TIPOS_CON_CONTROL = new Set(['hikvision']);

export function ControlPanel({ panel }: { panel: EstadoPanel }) {
  const clienteConsultas = useQueryClient();
  const [confirmando, setConfirmando] = useState<AccionComando | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: comandos } = useQuery({
    queryKey: ['comandos', panel.id],
    queryFn: () => listarComandos(panel.id),
    // Un comando queda "esperando confirmación" hasta que el panel reporta:
    // se consulta cada tanto para que el operador vea cuándo se confirmó
    refetchInterval: 15_000,
  });

  const enviar = useMutation({
    mutationFn: (accion: AccionComando) => enviarComando(panel.id, accion),
    onSuccess: (r) => {
      setAviso(r.aceptado ? 'Orden enviada. Falta que el panel la confirme.' : (r.detalle ?? 'No se pudo enviar.'));
      setConfirmando(null);
      void clienteConsultas.invalidateQueries({ queryKey: ['comandos', panel.id] });
    },
    onError: (e: Error) => {
      setAviso(e.message);
      setConfirmando(null);
    },
  });

  if (!TIPOS_CON_CONTROL.has(panel.tipo)) return null;

  const ultimo = comandos?.[0];

  return (
    <section className="bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-tenue text-xs uppercase tracking-wider">Control del equipo</h3>
        {ultimo && (
          <span className="text-xs text-tenue">
            último: {ultimo.accion.replace('_', ' ')} · {NOMBRE_ESTADO[ultimo.estado]} · {fechaHora(ultimo.creadoEn)}
          </span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {ACCIONES.map((a) => (
          <button
            key={a.valor}
            onClick={() => (a.peligrosa ? setConfirmando(a.valor) : enviar.mutate(a.valor))}
            disabled={enviar.isPending || !panel.activo}
            className={`rounded-sm border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
              a.peligrosa
                ? 'border-prio1 text-prio1 hover:bg-prio1/15'
                : 'border-acento text-acento hover:bg-acento/15'
            }`}
          >
            {a.etiqueta}
          </button>
        ))}
      </div>

      {confirmando && (
        <div className="border border-prio1 rounded-sm p-3 flex flex-col gap-2 text-sm">
          <p>
            Desarmar deja el sitio <span className="font-semibold">sin protección</span> hasta que alguien vuelva a
            armarlo. ¿Confirma la orden?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => enviar.mutate(confirmando)}
              className="bg-prio1/15 border border-prio1 text-prio1 rounded-sm px-3 py-1 text-xs font-semibold"
            >
              Sí, desarmar
            </button>
            <button
              onClick={() => setConfirmando(null)}
              className="border border-borde rounded-sm px-3 py-1 text-xs text-tenue hover:text-texto"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {aviso && <p className="text-sm text-tenue">{aviso}</p>}

      {(comandos?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {comandos!.slice(0, 5).map((c) => (
            <li key={c.id} className="flex gap-2 items-baseline">
              <span className="font-datos text-tenue">{fechaHora(c.creadoEn)}</span>
              <span className="font-semibold">{c.accion.replace('_', ' ')}</span>
              <span
                className={
                  c.estado === 'confirmado' ? 'text-ok' : c.estado === 'fallido' ? 'text-prio1' : 'text-tenue'
                }
              >
                {NOMBRE_ESTADO[c.estado]}
              </span>
              {c.detalle && <span className="text-tenue">· {c.detalle}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
