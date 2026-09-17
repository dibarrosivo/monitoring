import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { accionAlarma, alarma, cliente, db, evento, panel, sesionOperador, sitio, usuario } from '@monitoring/db';
import type { App } from '../tipos.js';

/**
 * Supervisión del personal: qué hizo cada operador y cómo. Es el único módulo
 * que mira a las personas y no a los clientes, y por eso es solo para
 * administradores y supervisores.
 *
 * Todo sale de lo que ya se registra: la bitácora de cada alarma (tomas,
 * llamadas, notas, pasos, cierres con su tiempo), los cierres con desenlace
 * y motivo, los avisos del hombre muerto y las sesiones. No hay una segunda
 * contabilidad que pueda contradecir a la bitácora.
 */

interface Periodo {
  desde: Date;
  hasta: Date;
}

function leerPeriodo(query: { desde?: string; hasta?: string }): Periodo | null {
  const hasta = query.hasta ? new Date(query.hasta) : new Date();
  const desde = query.desde ? new Date(query.desde) : new Date(hasta.getTime() - 7 * 24 * 60 * 60_000);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || desde > hasta) return null;
  return { desde, hasta };
}

const MINUTOS_EN_SERVICIO = 15;
const MINUTOS_SIN_TOMAR_PRIORIDAD_1 = 2;
const MINUTOS_SIN_TOMAR = 10;
const MINUTOS_SIN_ACTIVIDAD = 30;

function segundos(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
}

export function registrarSupervision(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', async (request, reply) => {
    if (request.user.rol !== 'admin' && request.user.rol !== 'supervisor') {
      return reply.code(403).send({ error: 'Solo administradores y supervisores' });
    }
  });

  /** Resumen por operador en un período, más las alertas de supervisión del momento. */
  app.get('/supervision', async (request, reply) => {
    const periodo = leerPeriodo(request.query as { desde?: string; hasta?: string });
    if (!periodo) return reply.code(400).send({ error: 'Período inválido' });

    const personal = await db
      .select({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, activo: usuario.activo })
      .from(usuario)
      .where(ne(usuario.rol, 'cliente'))
      .orderBy(usuario.nombre);

    // Bitácora del período, con el operador que hizo cada cosa
    const acciones = await db
      .select({ operadorId: accionAlarma.operadorId, tipo: accionAlarma.tipo, detalle: accionAlarma.detalle })
      .from(accionAlarma)
      .where(and(gte(accionAlarma.creadoEn, periodo.desde), lte(accionAlarma.creadoEn, periodo.hasta)));

    // Alarmas tomadas en el período: de ahí sale la reacción
    const tomadas = await db
      .select({ operadorId: alarma.operadorId, creadoEn: alarma.creadoEn, tomadaEn: alarma.tomadaEn, cerradaEn: alarma.cerradaEn })
      .from(alarma)
      .where(and(gte(alarma.tomadaEn, periodo.desde), lte(alarma.tomadaEn, periodo.hasta)));

    // Alarmas cerradas en el período: desenlaces, motivos y atención
    const cerradas = await db
      .select({
        operadorId: alarma.operadorId,
        tomadaEn: alarma.tomadaEn,
        cerradaEn: alarma.cerradaEn,
        desenlace: alarma.desenlace,
        motivo: alarma.motivo,
      })
      .from(alarma)
      .where(and(eq(alarma.estado, 'cerrada'), gte(alarma.cerradaEn, periodo.desde), lte(alarma.cerradaEn, periodo.hasta)));

    const hombreMuerto = await db
      .select({ descripcion: evento.descripcion })
      .from(evento)
      .where(and(eq(evento.codigo, 'HM'), gte(evento.ocurridoEn, periodo.desde), lte(evento.ocurridoEn, periodo.hasta)));

    const sesiones = await db
      .select({ usuarioId: sesionOperador.usuarioId, ingresoEn: sesionOperador.ingresoEn, ultimaActividadEn: sesionOperador.ultimaActividadEn })
      .from(sesionOperador)
      .where(and(gte(sesionOperador.ingresoEn, periodo.desde), lte(sesionOperador.ingresoEn, periodo.hasta)));

    // Última actividad de cada uno, sin importar el período: dice quién está en servicio ahora
    const ultimas = await db
      .select({ usuarioId: sesionOperador.usuarioId, ultimaActividadEn: sql<Date>`max(${sesionOperador.ultimaActividadEn})` })
      .from(sesionOperador)
      .groupBy(sesionOperador.usuarioId);
    const ultimaPorUsuario = new Map(ultimas.map((u) => [u.usuarioId, new Date(u.ultimaActividadEn)]));

    const ahora = Date.now();
    const operadores = personal.map((p) => {
      const propias = acciones.filter((a) => a.operadorId === p.id);
      const cuenta = (tipo: string) => propias.filter((a) => a.tipo === tipo).length;
      const reacciones = tomadas.filter((t) => t.operadorId === p.id && t.tomadaEn).map((t) => segundos(t.creadoEn, t.tomadaEn!));
      const cierres = cerradas.filter((c) => c.operadorId === p.id);
      const atenciones = cierres.filter((c) => c.tomadaEn && c.cerradaEn).map((c) => segundos(c.tomadaEn!, c.cerradaEn!));
      const desenlaces = { resuelta: 0, falsa_alarma: 0, escalada: 0 };
      const motivos = new Map<string, number>();
      for (const c of cierres) {
        if (c.desenlace) desenlaces[c.desenlace]++;
        if (c.motivo) motivos.set(`${c.desenlace}:${c.motivo}`, (motivos.get(`${c.desenlace}:${c.motivo}`) ?? 0) + 1);
      }
      const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
      const sesionesPropias = sesiones.filter((s) => s.usuarioId === p.id);
      const ultimaActividadEn = ultimaPorUsuario.get(p.id) ?? null;
      return {
        id: p.id,
        nombre: p.nombre,
        email: p.email,
        rol: p.rol,
        activo: p.activo,
        tomadas: reacciones.length,
        cerradas: cierres.length,
        reaccionMediaSeg: media(reacciones),
        reaccionMaxSeg: reacciones.length ? Math.max(...reacciones) : null,
        atencionMediaSeg: media(atenciones),
        desenlaces,
        motivos: [...motivos.entries()].map(([clave, n]) => ({ desenlace: clave.split(':')[0]!, motivo: clave.split(':')[1]!, n })).sort((a, b) => b.n - a.n),
        llamadas: cuenta('llamada'),
        notas: cuenta('nota'),
        pasos: cuenta('paso'),
        devoluciones: propias.filter((a) => a.tipo === 'sistema' && (a.detalle ?? '').startsWith('Devuelta a la cola')).length,
        hombreMuerto: hombreMuerto.filter((h) => h.descripcion.includes(p.email)).length,
        sesiones: sesionesPropias.length,
        horasEnServicio: Math.round(sesionesPropias.reduce((t, s) => t + (s.ultimaActividadEn.getTime() - s.ingresoEn.getTime()), 0) / 36_000) / 100,
        ultimaActividadEn,
        enServicio: ultimaActividadEn !== null && ahora - ultimaActividadEn.getTime() < MINUTOS_EN_SERVICIO * 60_000,
      };
    });

    return { periodo, operadores, alertas: await alertasDeSupervision() };
  });

  /** Línea de tiempo de un operador: cada acción, ingreso y aviso, en orden. */
  app.get('/supervision/operadores/:id/actividad', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const periodo = leerPeriodo(request.query as { desde?: string; hasta?: string });
    if (!periodo) return reply.code(400).send({ error: 'Período inválido' });
    const [persona] = await db.select({ id: usuario.id, nombre: usuario.nombre, email: usuario.email }).from(usuario).where(eq(usuario.id, id)).limit(1);
    if (!persona) return reply.code(404).send({ error: 'Usuario no encontrado' });

    const acciones = await db
      .select({
        id: accionAlarma.id,
        creadoEn: accionAlarma.creadoEn,
        tipo: accionAlarma.tipo,
        detalle: accionAlarma.detalle,
        alarmaId: accionAlarma.alarmaId,
        codigo: evento.codigo,
        descripcion: evento.descripcion,
        numeroCuenta: evento.numeroCuenta,
        prefijo: panel.prefijo,
        clienteNombre: cliente.nombre,
      })
      .from(accionAlarma)
      .innerJoin(alarma, eq(accionAlarma.alarmaId, alarma.id))
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .leftJoin(panel, eq(alarma.panelId, panel.id))
      .leftJoin(sitio, eq(panel.sitioId, sitio.id))
      .leftJoin(cliente, eq(sitio.clienteId, cliente.id))
      .where(and(eq(accionAlarma.operadorId, id), gte(accionAlarma.creadoEn, periodo.desde), lte(accionAlarma.creadoEn, periodo.hasta)))
      .orderBy(desc(accionAlarma.creadoEn))
      .limit(500);

    const sesiones = await db
      .select()
      .from(sesionOperador)
      .where(and(eq(sesionOperador.usuarioId, id), gte(sesionOperador.ingresoEn, periodo.desde), lte(sesionOperador.ingresoEn, periodo.hasta)))
      .orderBy(desc(sesionOperador.ingresoEn))
      .limit(200);

    const avisos = await db
      .select({ id: evento.id, ocurridoEn: evento.ocurridoEn, descripcion: evento.descripcion })
      .from(evento)
      .where(and(eq(evento.codigo, 'HM'), sql`${evento.descripcion} like ${'%' + persona.email + '%'}`, gte(evento.ocurridoEn, periodo.desde), lte(evento.ocurridoEn, periodo.hasta)))
      .orderBy(desc(evento.ocurridoEn));

    return { operador: persona, periodo, acciones, sesiones, hombreMuerto: avisos };
  });
}

/**
 * Lo que un supervisor querría que le señalen ahora mismo, sin buscarlo:
 * emergencias sin tomar, alarmas viejas sin tomar, cierres sin ninguna
 * llamada registrada, y operadores en sesión que no tocan la consola.
 */
async function alertasDeSupervision() {
  const ahora = Date.now();
  const abiertas = await db
    .select({ id: alarma.id, prioridad: alarma.prioridad, creadoEn: alarma.creadoEn, codigo: evento.codigo, descripcion: evento.descripcion, numeroCuenta: evento.numeroCuenta, prefijo: panel.prefijo })
    .from(alarma)
    .innerJoin(evento, eq(alarma.eventoId, evento.id))
    .leftJoin(panel, eq(alarma.panelId, panel.id))
    .where(eq(alarma.estado, 'nueva'));

  const sinTomar = abiertas
    .filter((a) => {
      const minutos = (ahora - a.creadoEn.getTime()) / 60_000;
      return a.prioridad <= 1 ? minutos >= MINUTOS_SIN_TOMAR_PRIORIDAD_1 : minutos >= MINUTOS_SIN_TOMAR;
    })
    .map((a) => ({
      tipo: 'sin_tomar' as const,
      alarmaId: a.id,
      prioridad: a.prioridad,
      texto: `${a.codigo} ${a.descripcion} (${a.prefijo ? `${a.prefijo}-` : ''}${a.numeroCuenta ?? '?'}) lleva ${Math.round((ahora - a.creadoEn.getTime()) / 60_000)} min sin tomar`,
    }));

  // Cierres de alarmas reales por OPERADORES en las últimas 24 h sin una sola
  // llamada registrada. Los cierres del administrador no se señalan: son los
  // del propio supervisor (por ejemplo, la limpieza de un histórico).
  const hace24h = new Date(ahora - 24 * 60 * 60_000);
  const cerradasRecientes = await db
    .select({ id: alarma.id, operadorId: alarma.operadorId, operadorNombre: usuario.nombre, codigo: evento.codigo, descripcion: evento.descripcion, categoria: evento.categoria })
    .from(alarma)
    .innerJoin(evento, eq(alarma.eventoId, evento.id))
    .innerJoin(usuario, eq(alarma.operadorId, usuario.id))
    .where(and(eq(alarma.estado, 'cerrada'), gte(alarma.cerradaEn, hace24h), eq(evento.categoria, 'alarma'), eq(usuario.rol, 'operador')));
  const conLlamada = new Set(
    cerradasRecientes.length
      ? (
          await db
            .select({ alarmaId: accionAlarma.alarmaId })
            .from(accionAlarma)
            .where(and(inArray(accionAlarma.alarmaId, cerradasRecientes.map((c) => c.id)), eq(accionAlarma.tipo, 'llamada')))
        ).map((a) => a.alarmaId)
      : [],
  );
  const sinLlamada = cerradasRecientes
    .filter((c) => !conLlamada.has(c.id))
    .map((c) => ({
      tipo: 'cierre_sin_llamada' as const,
      alarmaId: c.id,
      texto: `${c.operadorNombre ?? 'Alguien'} cerró ${c.codigo} ${c.descripcion} sin registrar ninguna llamada`,
    }));

  // En sesión (actividad en las últimas 12 h) pero sin tocar la consola hace rato
  const ultimas = await db
    .select({ usuarioId: sesionOperador.usuarioId, nombre: usuario.nombre, ultimaActividadEn: sql<Date>`max(${sesionOperador.ultimaActividadEn})` })
    .from(sesionOperador)
    .innerJoin(usuario, eq(sesionOperador.usuarioId, usuario.id))
    .groupBy(sesionOperador.usuarioId, usuario.nombre);
  const inactivos = ultimas
    .map((u) => ({ ...u, minutos: (ahora - new Date(u.ultimaActividadEn).getTime()) / 60_000 }))
    .filter((u) => u.minutos >= MINUTOS_SIN_ACTIVIDAD && u.minutos < 12 * 60)
    .map((u) => ({ tipo: 'sin_actividad' as const, usuarioId: u.usuarioId, texto: `${u.nombre} no toca la consola hace ${Math.round(u.minutos)} min` }));

  return [...sinTomar, ...sinLlamada, ...inactivos];
}
