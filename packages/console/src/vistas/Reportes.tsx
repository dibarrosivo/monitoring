import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { generarReporte, listarClientes } from '../api.js';
import type { Reporte } from '../tipos.js';
import { fechaHora } from '../tiempo.js';
import { NOMBRE_CATEGORIA } from '../ui.js';

const CAMPO = 'bg-fondo border border-borde rounded-sm px-3 py-1.5 text-sm';
const BOTON = 'bg-superficie-2 hover:bg-borde border border-borde rounded-sm px-3 py-1.5 text-sm disabled:opacity-50';

function mesActual(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
}

function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, numeroMes] = mes.split('-').map(Number);
  const desde = new Date(anio!, numeroMes! - 1, 1);
  const hasta = new Date(anio!, numeroMes!, 1);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

function duracion(segundos: number | null): string {
  if (segundos == null) return '—';
  if (segundos < 60) return `${segundos} s`;
  return `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}

export function Reportes() {
  const { data: clientes } = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [mes, setMes] = useState(mesActual());
  const [parametros, setParametros] = useState<{ clienteId: number; desde: string; hasta: string } | null>(null);

  const { data: reporte, isFetching } = useQuery({
    queryKey: ['reporte', parametros],
    queryFn: () => generarReporte(parametros!.clienteId, parametros!.desde, parametros!.hasta),
    enabled: parametros !== null,
  });

  function descargarCsv(datos: Reporte) {
    const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [
      ['fecha', 'codigo', 'categoria', 'descripcion', 'cuenta', 'zona', 'particion'].join(','),
      ...datos.eventos.map((e) =>
        [fechaHora(e.ocurridoEn), e.codigo, e.categoria, e.descripcion, e.numeroCuenta ?? '', e.zona ?? '', e.particion ?? '']
          .map(escapar)
          .join(','),
      ),
    ].join('\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob(['﻿' + filas], { type: 'text/csv;charset=utf-8' }));
    enlace.download = `reporte-${datos.cliente.nombre.replace(/\s+/g, '-')}-${mes}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  return (
    <div className="max-w-4xl flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (clienteId) setParametros({ clienteId, ...rangoDelMes(mes) });
        }}
        className="no-imprimir bg-superficie border border-borde rounded-sm p-4 flex flex-wrap gap-2 items-center"
      >
        <select value={clienteId ?? ''} onChange={(e) => setClienteId(Number(e.target.value) || null)} required className={CAMPO}>
          <option value="">Elegir cliente…</option>
          {(clientes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} required className={`${CAMPO} font-datos`} />
        <button type="submit" disabled={!clienteId || isFetching} className={BOTON}>
          {isFetching ? 'Generando…' : 'Generar reporte'}
        </button>
        {reporte && (
          <>
            <button type="button" onClick={() => window.print()} className={BOTON}>
              Imprimir / PDF
            </button>
            <button type="button" onClick={() => descargarCsv(reporte)} className={BOTON}>
              Descargar CSV
            </button>
          </>
        )}
      </form>

      {reporte && (
        <article className="reporte bg-superficie border border-borde rounded-sm p-6 flex flex-col gap-5">
          <header>
            <h1 className="text-xl font-semibold">Reporte de actividad — {reporte.cliente.nombre}</h1>
            <p className="text-tenue text-sm">
              Período: {new Date(reporte.periodo.desde).toLocaleDateString('es')} al{' '}
              {new Date(new Date(reporte.periodo.hasta).getTime() - 1).toLocaleDateString('es')} · Paneles:{' '}
              {reporte.paneles.map((p) => `${p.numeroCuenta} (${p.sitioNombre})`).join(', ') || 'ninguno'}
            </p>
          </header>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            {[
              ['Eventos', String(reporte.estadisticas.totalEventos)],
              ['Alarmas', String(reporte.estadisticas.totalAlarmas)],
              ['Respuesta media', duracion(reporte.estadisticas.respuestaMediaSeg)],
              ['Cierre medio', duracion(reporte.estadisticas.cierreMedioSeg)],
            ].map(([nombre, valor]) => (
              <div key={nombre} className="border border-borde rounded-sm p-3">
                <p className="font-datos text-2xl">{valor}</p>
                <p className="text-tenue text-xs uppercase tracking-wider">{nombre}</p>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-tenue text-xs uppercase tracking-wider mb-2">Actividad por categoría</h2>
            <table className="w-full text-sm">
              <tbody>
                {reporte.totalesPorCategoria.map((t) => (
                  <tr key={t.categoria} className="border-b border-borde/40">
                    <td className="py-1">{NOMBRE_CATEGORIA[t.categoria]}</td>
                    <td className="py-1 text-right font-datos">{t.cantidad}</td>
                  </tr>
                ))}
                {reporte.totalesPorCategoria.length === 0 && (
                  <tr>
                    <td className="py-2 text-tenue">Sin actividad en el período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-tenue text-xs uppercase tracking-wider mb-2">
              Alarmas del período ({reporte.alarmas.length})
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-tenue text-xs uppercase">
                  <th className="py-1 font-medium">Fecha</th>
                  <th className="py-1 font-medium">Código</th>
                  <th className="py-1 font-medium">Descripción</th>
                  <th className="py-1 font-medium">Respuesta</th>
                  <th className="py-1 font-medium">Resolución</th>
                </tr>
              </thead>
              <tbody>
                {reporte.alarmas.map((a) => (
                  <tr key={a.id} className="border-b border-borde/40 align-top">
                    <td className="py-1 pr-3 font-datos whitespace-nowrap">{fechaHora(a.creadoEn)}</td>
                    <td className="py-1 pr-3 font-datos">{a.codigo}</td>
                    <td className="py-1 pr-3">{a.descripcion}</td>
                    <td className="py-1 pr-3 font-datos whitespace-nowrap">
                      {a.tomadaEn
                        ? duracion(Math.round((new Date(a.tomadaEn).getTime() - new Date(a.creadoEn).getTime()) / 1000))
                        : 'sin atender'}
                    </td>
                    <td className="py-1 text-tenue">{a.resolucion ?? (a.estado === 'cerrada' ? '—' : 'abierta')}</td>
                  </tr>
                ))}
                {reporte.alarmas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 text-tenue">
                      Sin alarmas en el período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <footer className="text-tenue text-xs">
            Generado el {new Date().toLocaleString('es')} · Central de monitoreo
          </footer>
        </article>
      )}
    </div>
  );
}
