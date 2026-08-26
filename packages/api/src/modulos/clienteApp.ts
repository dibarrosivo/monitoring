import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { acceso, alarma, cliente, db, evento, panel, sitio, zona } from '@monitoring/db';
import { abrirAlarma } from '@monitoring/engine';
import type { App } from '../tipos.js';

/**
 * API de la app de clientes. El alcance sale de la tabla `acceso` en CADA
 * pedido (revocar un permiso corta el acceso al instante): una fila con
 * panelId da solo ese panel; con sitioId, ese sitio; con ambos NULL, todo
 * el cliente. Un usuario puede tener accesos sobre varios clientes.
 */
export function registrarClienteApp(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', async (request, reply) => {
    if (request.user.rol !== 'cliente') {
      return reply.code(403).send({ error: 'Solo usuarios de la app de clientes' });
    }
  });

  /** Paneles visibles para el usuario según sus accesos (la única guardia de aislamiento). */
  async function panelesDelUsuario(usuarioId: number) {
    return db
      .selectDistinctOn([panel.id], {
        id: panel.id,
        numeroCuenta: panel.numeroCuenta,
        tipo: panel.tipo,
        activo: panel.activo,
        ultimaSenalEn: panel.ultimaSenalEn,
        sitioId: sitio.id,
        sitioNombre: sitio.nombre,
        sitioDireccion: sitio.direccion,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
      })
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
      );
  }

  app.get('/cliente/resumen', async (request) => {
    const paneles = await panelesDelUsuario(request.user.id);

    const conEstado = await Promise.all(
      paneles.map(async (p) => {
        const [ultimoMovimiento] = await db
          .select({ categoria: evento.categoria, ocurridoEn: evento.ocurridoEn })
          .from(evento)
          .where(and(eq(evento.panelId, p.id), inArray(evento.categoria, ['apertura', 'cierre'])))
          .orderBy(desc(evento.ocurridoEn))
          .limit(1);
        return {
          ...p,
          estadoArmado:
            ultimoMovimiento?.categoria === 'cierre'
              ? 'armado'
              : ultimoMovimiento?.categoria === 'apertura'
                ? 'desarmado'
                : 'desconocido',
          ultimoMovimientoEn: ultimoMovimiento?.ocurridoEn ?? null,
        };
      }),
    );

    return { paneles: conEstado };
  });

  app.get('/cliente/eventos', async (request) => {
    const { limite } = request.query as { limite?: string };
    const max = Math.min(Number(limite ?? 50), 200);
    const paneles = await panelesDelUsuario(request.user.id);
    if (paneles.length === 0) return [];
    return db
      .select({
        id: evento.id,
        panelId: evento.panelId,
        categoria: evento.categoria,
        codigo: evento.codigo,
        descripcion: evento.descripcion,
        zona: evento.zona,
        ocurridoEn: evento.ocurridoEn,
        zonaDescripcion: zona.descripcion,
      })
      .from(evento)
      .leftJoin(zona, and(eq(zona.panelId, evento.panelId), eq(zona.numero, evento.zona)))
      .where(
        and(
          inArray(
            evento.panelId,
            paneles.map((p) => p.id),
          ),
          // Las pruebas periódicas son ruido para el cliente final
          ne(evento.categoria, 'prueba'),
        ),
      )
      .orderBy(desc(evento.ocurridoEn))
      .limit(max);
  });

  /** Alarmas abiertas sobre sus paneles: "la central está atendiendo su alarma". */
  app.get('/cliente/alarmas', async (request) => {
    const paneles = await panelesDelUsuario(request.user.id);
    if (paneles.length === 0) return [];
    return db
      .select({
        id: alarma.id,
        estado: alarma.estado,
        prioridad: alarma.prioridad,
        creadoEn: alarma.creadoEn,
        descripcion: evento.descripcion,
        codigo: evento.codigo,
        panelId: alarma.panelId,
      })
      .from(alarma)
      .innerJoin(evento, eq(alarma.eventoId, evento.id))
      .where(
        and(
          inArray(
            alarma.panelId,
            paneles.map((p) => p.id),
          ),
          ne(alarma.estado, 'cerrada'),
        ),
      )
      .orderBy(alarma.prioridad, desc(alarma.creadoEn));
  });

  const esquemaPanico = z.object({ sitioId: z.number().int() });

  /** Botón de pánico: entra a la cola del operador como prioridad máxima. */
  app.post('/cliente/panico', async (request, reply) => {
    const datos = esquemaPanico.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'sitioId requerido' });

    // El sitio tiene que estar dentro de los accesos del usuario
    const paneles = await panelesDelUsuario(request.user.id);
    const delSitio = paneles.filter((p) => p.sitioId === datos.data.sitioId);
    if (delSitio.length === 0) return reply.code(404).send({ error: 'Sitio no encontrado' });
    const referencia = delSitio[0]!;

    const descripcion = `BOTÓN DE PÁNICO (app): ${request.user.email} — ${referencia.sitioNombre}${
      referencia.sitioDireccion ? `, ${referencia.sitioDireccion}` : ''
    }`;
    const [filaEvento] = await db
      .insert(evento)
      .values({
        panelId: referencia.id,
        numeroCuenta: referencia.numeroCuenta,
        categoria: 'alarma',
        codigo: 'PANICO',
        descripcion,
        prioridad: 1,
        ocurridoEn: new Date(),
      })
      .returning({ id: evento.id });

    const alarmaId = await abrirAlarma({
      eventoId: filaEvento!.id,
      panelId: referencia.id,
      prioridad: 1,
      descripcion,
      numeroCuenta: referencia.numeroCuenta,
    });

    return reply.code(201).send({ alarmaId, recibido: true });
  });
}
