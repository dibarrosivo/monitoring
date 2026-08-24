import { desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { accionAlarma, alarma, db, evento, panel } from '@monitoring/db';
import type { App } from '../tipos.js';

const esquemaNota = z.object({ detalle: z.string().min(1) });
const esquemaCierre = z.object({ resolucion: z.string().min(1) });

export function registrarAlarmas(app: App) {
  app.addHook('onRequest', app.autenticar);

  /** Cola del operador: por defecto todas las alarmas no cerradas, primero las de mayor prioridad. */
  app.get('/alarmas', async (request) => {
    const { estado } = request.query as { estado?: 'nueva' | 'en_atencion' | 'cerrada' };
    const condicion = estado ? eq(alarma.estado, estado) : ne(alarma.estado, 'cerrada');
    return db
      .select({
        id: alarma.id,
        estado: alarma.estado,
        prioridad: alarma.prioridad,
        operadorId: alarma.operadorId,
        creadoEn: alarma.creadoEn,
        tomadaEn: alarma.tomadaEn,
        cerradaEn: alarma.cerradaEn,
        resolucion: alarma.resolucion,
        evento: {
          id: evento.id,
          codigo: evento.codigo,
          categoria: evento.categoria,
          descripcion: evento.descripcion,
          numeroCuenta: evento.numeroCuenta,
          particion: evento.particion,
          zona: evento.zona,
          ocurridoEn: evento.ocurridoEn,
        },
        panelId: alarma.panelId,
      })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .where(condicion)
      .orderBy(alarma.prioridad, desc(alarma.creadoEn))
      .limit(500);
  });

  app.get('/alarmas/:id/acciones', async (request) => {
    const id = Number((request.params as { id: string }).id);
    return db.select().from(accionAlarma).where(eq(accionAlarma.alarmaId, id)).orderBy(accionAlarma.creadoEn);
  });

  app.post('/alarmas/:id/tomar', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [fila] = await db
      .update(alarma)
      .set({ estado: 'en_atencion', operadorId: request.user.id, tomadaEn: new Date() })
      .where(eq(alarma.id, id))
      .returning();
    if (!fila) return reply.code(404).send({ error: 'Alarma no encontrada' });
    await db.insert(accionAlarma).values({ alarmaId: id, operadorId: request.user.id, tipo: 'toma' });
    return fila;
  });

  app.post('/alarmas/:id/notas', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaNota.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db
      .insert(accionAlarma)
      .values({ alarmaId: id, operadorId: request.user.id, tipo: 'nota', detalle: datos.data.detalle })
      .returning();
    return reply.code(201).send(fila);
  });

  app.post('/alarmas/:id/cerrar', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const datos = esquemaCierre.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db
      .update(alarma)
      .set({ estado: 'cerrada', cerradaEn: new Date(), resolucion: datos.data.resolucion })
      .where(eq(alarma.id, id))
      .returning();
    if (!fila) return reply.code(404).send({ error: 'Alarma no encontrada' });
    await db.insert(accionAlarma).values({ alarmaId: id, operadorId: request.user.id, tipo: 'cierre', detalle: datos.data.resolucion });
    return fila;
  });

  /** Estado operativo de los paneles (última señal de vida). */
  app.get('/paneles/estado', async () =>
    db
      .select({
        id: panel.id,
        sitioId: panel.sitioId,
        numeroCuenta: panel.numeroCuenta,
        tipo: panel.tipo,
        supervisado: panel.supervisado,
        intervaloPruebaMin: panel.intervaloPruebaMin,
        ultimaSenalEn: panel.ultimaSenalEn,
        activo: panel.activo,
      })
      .from(panel)
      .orderBy(panel.numeroCuenta),
  );
}
