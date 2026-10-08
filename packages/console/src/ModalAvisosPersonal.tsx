import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { guardarAvisosPersonal, verAvisosPersonal } from './api.js';
import { PREFERENCIAS_PERSONAL_POR_DEFECTO, type PreferenciasPersonal, type VozPush } from '@monitoring/shared';

/**
 * «Mis avisos»: qué le llega al teléfono de cada persona del personal y cuándo
 * suena. Es su teléfono personal, así que decide todo, aun estando de guardia;
 * el lugar de trabajo es la consola, y lo que no le llegue al teléfono sigue
 * en la cola.
 */

const OPCIONES: { clave: 'emergencias' | 'fallasCentral' | 'informativos'; titulo: string; detalle: string }[] = [
  { clave: 'emergencias', titulo: 'Emergencias de clientes', detalle: 'Pánico, incendio, coacción, emergencia médica. Solo si está de guardia, o si no hay nadie asignado.' },
  { clave: 'fallasCentral', titulo: 'Fallas de la central', detalle: 'Central sin señales, puente PIMA caído.' },
  { clave: 'informativos', titulo: 'Avisos informativos', detalle: 'Puente restablecido, panel de un cliente que dejó de reportar.' },
];

const VOCES: { valor: VozPush; texto: string }[] = [
  { valor: 'siempre', texto: 'Siempre' },
  { valor: 'solo_alarmas', texto: 'Solo alarmas' },
  { valor: 'nunca', texto: 'Nunca' },
];

const CAMPO = 'bg-fondo border border-borde rounded-sm px-2 py-1.5 text-sm font-datos';

export function ModalAvisosPersonal({ alCerrar }: { alCerrar: () => void }) {
  const { data } = useQuery({ queryKey: ['avisos-personal'], queryFn: verAvisosPersonal });
  const [p, setP] = useState<PreferenciasPersonal>(PREFERENCIAS_PERSONAL_POR_DEFECTO);
  const [conSilencio, setConSilencio] = useState(false);
  useEffect(() => {
    if (!data) return;
    setP(data);
    setConSilencio(Boolean(data.silencioDesde));
  }, [data]);

  const guardar = useMutation({
    mutationFn: () =>
      guardarAvisosPersonal({
        ...p,
        silencioDesde: conSilencio ? (p.silencioDesde ?? '22:00') : null,
        silencioHasta: conSilencio ? (p.silencioHasta ?? '07:00') : null,
      }),
    onSuccess: alCerrar,
  });

  return (
    <div className="fixed inset-0 z-50 bg-fondo/80 flex items-center justify-center p-4" onClick={alCerrar} role="dialog">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
        className="w-full max-w-sm bg-superficie border border-borde rounded-sm p-4 flex flex-col gap-3 max-h-full overflow-y-auto"
      >
        <h2 className="text-tenue text-xs uppercase tracking-wider">Mis avisos en el teléfono</h2>
        <p className="text-tenue text-xs">
          Usted decide qué le llega a su teléfono y cuándo suena. Lo que apague sigue apareciendo en la consola.
        </p>

        {OPCIONES.map((o) => (
          <label key={o.clave} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={p[o.clave]} onChange={(e) => setP({ ...p, [o.clave]: e.target.checked })} />
            <span>
              {o.titulo}
              <span className="block text-xs text-tenue">{o.detalle}</span>
            </span>
          </label>
        ))}

        <label className="flex items-start gap-2 text-sm border-t border-borde/60 pt-3">
          <input type="checkbox" className="mt-1" checked={conSilencio} onChange={(e) => setConSilencio(e.target.checked)} />
          <span>
            Horario de silencio
            <span className="block text-xs text-tenue">En esa franja no le suena nada de la central, emergencias incluidas.</span>
          </span>
        </label>
        {conSilencio && (
          <div className="flex items-center gap-2 text-sm pl-6">
            <span className="text-tenue">de</span>
            <input type="time" value={p.silencioDesde ?? '22:00'} onChange={(e) => setP({ ...p, silencioDesde: e.target.value })} className={CAMPO} />
            <span className="text-tenue">a</span>
            <input type="time" value={p.silencioHasta ?? '07:00'} onChange={(e) => setP({ ...p, silencioHasta: e.target.value })} className={CAMPO} />
          </div>
        )}

        <div className="flex flex-col gap-1 text-sm border-t border-borde/60 pt-3">
          <span>Leer los avisos en voz alta</span>
          <div className="flex gap-1.5">
            {VOCES.map((v) => (
              <button
                key={v.valor}
                type="button"
                onClick={() => setP({ ...p, vozPush: v.valor })}
                className={`flex-1 border rounded-sm py-1.5 text-xs ${p.vozPush === v.valor ? 'border-acento text-acento bg-acento/10' : 'border-borde text-tenue'}`}
              >
                {v.texto}
              </button>
            ))}
          </div>
        </div>

        {guardar.isError && <p className="text-prio1 text-sm">No se pudo guardar. Revise la conexión.</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={alCerrar} className="text-tenue hover:text-texto text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardar.isPending || !data}
            className="bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
