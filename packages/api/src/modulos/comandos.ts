import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { acceso, cliente, db, panel, sitio, zona } from '@monitoring/db';
import { admiteControl, enviarComando, estadoArmado, estadoDetallado, historialComandos } from '@monitoring/engine';
import type { App } from '../tipos.js';
import type { FastifyRequest } from 'fastify';

/**
 * Comandos a los paneles: armar, armar en casa, desarmar.
 *
 * Dos guardias antes de dejar pasar cualquier orden:
 *
 *  1. El equipo tiene que admitir control. Hoy solo Hikvision; los demás
 *     reportan por vías de un solo sentido y no hay por dónde mandarles nada.
 *  2. Quien lo pide tiene que poder. El personal de la central sí; un usuario
 *     de la app, solo sobre los equipos que sus accesos alcanzan.
 *
 * Desarmar deja un local sin protección, así que esto es una superficie de
 * seguridad, no una comodidad. Todo comando queda registrado con su autor.
 */

const esquemaComando = z.object({
  accion: z.enum(['armar', 'armar_casa', 'desarmar']),
  particion: z.string().max(4).optional(),
});

/** ¿Los accesos de este usuario alcanzan a este equipo? */
async function usuarioAlcanzaPanel(usuarioId: number, panelId: number): Promise<boolean> {
  const filas = await db
    .select({ id: panel.id })
    .from(panel)
    .innerJoin(sitio, eq(panel.sitioId, sitio.id))
    .innerJoin(cliente, eq(sitio.clienteId, cliente.id))
    .innerJoin(
      acceso,
      and(
        eq(acceso.usuarioId, usuarioId),
        eq(acceso.clienteId, cliente.id),
        or(
          eq(acceso.panelId, panel.id),
          and(isNull(acceso.panelId), eq(acceso.sitioId, sitio.id)),
          and(isNull(acceso.panelId), isNull(acceso.sitioId)),
        ),
      ),
    )
    .where(eq(panel.id, panelId))
    .limit(1);
  return filas.length > 0;
}

function idDe(request: FastifyRequest): number {
  return Number((request.params as { id: string }).id);
}

export function registrarComandos(app: App) {
  app.addHook('onRequest', app.autenticar);

  app.post('/paneles/:id/comando', async (request, reply) => {
    const panelId = idDe(request);
    const datos = esquemaComando.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });

    const [equipo] = await db
      .select({ id: panel.id, tipo: panel.tipo, activo: panel.activo, serial: panel.serial })
      .from(panel)
      .where(eq(panel.id, panelId))
      .limit(1);
    if (!equipo) return reply.code(404).send({ error: 'Equipo no encontrado' });

    // Guardia 1: el tipo de equipo admite control
    if (!admiteControl(equipo.tipo)) {
      return reply.code(409).send({ error: 'Este equipo no admite control remoto' });
    }
    if (!equipo.activo) {
      return reply.code(409).send({ error: 'El equipo está dado de baja' });
    }
    if (!equipo.serial) {
      // Sin serial no hay forma de nombrar el equipo ante el fabricante
      return reply.code(409).send({ error: 'El equipo no tiene serial cargado' });
    }

    // Guardia 2: quien lo pide puede hacerlo. Por decisión de la central, los
    // operadores no mandan órdenes a los paneles: solo administradores y el
    // propio cliente sobre sus equipos. Ver y consultar el estado sí pueden.
    if (request.user.rol === 'operador' || request.user.rol === 'supervisor') {
      return reply.code(403).send({ error: 'El control de paneles está reservado a administradores' });
    }
    if (request.user.rol === 'cliente') {
      const alcanza = await usuarioAlcanzaPanel(request.user.id, panelId);
      if (!alcanza) return reply.code(403).send({ error: 'Sin acceso a este equipo' });
    }

    const resultado = await enviarComando({
      panelId,
      usuarioId: request.user.id,
      accion: datos.data.accion,
      particion: datos.data.particion,
    });

    // Un comando rechazado por el fabricante no es un error nuestro: se informa
    // con el detalle y el registro queda igual, para poder diagnosticarlo.
    return reply.code(resultado.aceptado ? 202 : 502).send(resultado);
  });

  /**
   * Estado real de las particiones según el panel. Es lo único que dice si el
   * sitio está protegido ahora; nuestro historial solo dice qué se pidió.
   */
  app.get('/paneles/:id/estado-armado', async (request, reply) => {
    const panelId = idDe(request);
    if (request.user.rol === 'cliente') {
      const alcanza = await usuarioAlcanzaPanel(request.user.id, panelId);
      if (!alcanza) return reply.code(403).send({ error: 'Sin acceso a este equipo' });
    }
    try {
      const particiones = await estadoArmado(panelId);
      if (!particiones) return reply.code(409).send({ error: 'Este equipo no informa su estado' });
      return { particiones };
    } catch (err) {
      // El fabricante no respondió: no es un error nuestro, se informa tal cual
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Sin respuesta del proveedor' });
    }
  });

  /**
   * Estado completo según el panel: zonas, batería, conexiones, periféricos.
   * Es lo que la app del cliente muestra como "pantalla del panel". Los
   * nombres de zona vienen del propio panel; si acá hay una descripción
   * cargada para esa zona, se agrega como referencia.
   */
  app.get('/paneles/:id/estado-detallado', async (request, reply) => {
    const panelId = idDe(request);
    if (request.user.rol === 'cliente') {
      const alcanza = await usuarioAlcanzaPanel(request.user.id, panelId);
      if (!alcanza) return reply.code(403).send({ error: 'Sin acceso a este equipo' });
    }
    try {
      const detalle = await estadoDetallado(panelId);
      if (!detalle) return reply.code(409).send({ error: 'Este equipo no informa su estado' });
      const nuestras = await db.select({ numero: zona.numero, descripcion: zona.descripcion }).from(zona).where(eq(zona.panelId, panelId));
      const porNumero = new Map(nuestras.map((z) => [Number(z.numero), z.descripcion]));
      return {
        ...detalle,
        zonas: detalle.zonas.map((z) => ({ ...z, descripcion: porNumero.get(z.numero) ?? null })),
      };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Sin respuesta del proveedor' });
    }
  });

  app.get('/paneles/:id/comandos', async (request, reply) => {
    const panelId = idDe(request);
    if (request.user.rol === 'cliente') {
      const alcanza = await usuarioAlcanzaPanel(request.user.id, panelId);
      if (!alcanza) return reply.code(403).send({ error: 'Sin acceso a este equipo' });
    }
    return historialComandos(panelId);
  });
}
