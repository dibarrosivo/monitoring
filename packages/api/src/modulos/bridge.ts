import { and, count, desc, eq, gte, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bridge, db, evento, senal } from '@monitoring/db';
import { parsearLineaPima, parsearLineaSurgard } from '@monitoring/protocols';
import { interpretarCid, interpretarPima } from '@monitoring/shared';
import { buscarPanelPorCuenta, procesarEvento, registrarSenal, registrarVida } from '@monitoring/engine';
import type { App } from '../tipos.js';

/**
 * Ingreso de tramas desde los puentes de la central (el programa que corre en
 * la PC con el receptor PIMA y reenvía lo que sale por el puerto serie).
 *
 * El puente es deliberadamente tonto: manda la trama TAL CUAL la recibió. Todo
 * el parseo vive acá, así un cambio de formato se corrige en el servidor sin
 * volver a tocar la máquina de la central. Si la línea no se entiende, queda
 * igual en el diario crudo con estado 'error'.
 *
 * Autenticación por token compartido (BRIDGE_TOKEN), no por JWT: es una
 * máquina, no una persona.
 */

const esquemaTrama = z
  .object({
    /** Línea cruda de texto, tal como salió del receptor */
    cruda: z.string().min(1).max(2048).optional(),
    /** Trama binaria en base64: la usa el tap pasivo, que también copia protocolos que no son texto */
    crudaB64: z.string().min(1).max(8192).optional(),
    /** ip:puerto del equipo que transmitió, cuando el origen lo conoce */
    origen: z.string().max(64).optional(),
    /** Puerto del servidor al que llegó: dice qué receptor la esperaba */
    puerto: z.number().int().min(1).max(65535).optional(),
    /** Momento en que el puente la leyó (ISO); el servidor conserva su hora de recepción */
    leidaEn: z.string().datetime().optional(),
  })
  .refine((t) => Boolean(t.cruda) !== Boolean(t.crudaB64), {
    message: 'Cada trama lleva cruda o crudaB64, no ambas ni ninguna',
  });

const esquemaLote = z.object({
  bridge: z.string().min(1).max(64),
  fuente: z.string().max(16).optional(),
  version: z.string().max(16).optional(),
  tramas: z.array(esquemaTrama).min(1).max(200),
});

const esquemaLatido = z.object({
  bridge: z.string().min(1).max(64),
  fuente: z.string().max(16).optional(),
  version: z.string().max(16).optional(),
  tramasRecibidas: z.number().int().min(0).optional(),
});

/** Alta implícita: el puente se registra solo la primera vez que aparece. */
async function registrarPuente(datos: {
  nombre: string;
  fuente?: string;
  version?: string;
  tramasRecibidas?: number;
}): Promise<number> {
  const [fila] = await db
    .insert(bridge)
    .values({
      nombre: datos.nombre,
      fuente: datos.fuente,
      version: datos.version,
      ultimoLatidoEn: new Date(),
      tramasRecibidas: datos.tramasRecibidas ?? 0,
    })
    .onConflictDoUpdate({
      target: bridge.nombre,
      set: {
        fuente: datos.fuente,
        version: datos.version,
        ultimoLatidoEn: new Date(),
        ...(datos.tramasRecibidas !== undefined ? { tramasRecibidas: datos.tramasRecibidas } : {}),
      },
    })
    .returning({ id: bridge.id });
  return fila!.id;
}

/**
 * Una trama binaria se guarda en base64 para no perder un solo byte, pero si en
 * realidad era texto imprimible conviene guardarla legible: el diario crudo se
 * lee a ojo cuando hay que diagnosticar algo.
 */
function normalizarTrama(trama: { cruda?: string; crudaB64?: string }): {
  texto: string;
  codificacion: 'texto' | 'base64';
  bytes: Buffer;
} {
  if (trama.cruda !== undefined) {
    return { texto: trama.cruda, codificacion: 'texto', bytes: Buffer.from(trama.cruda, 'latin1') };
  }
  const bytes = Buffer.from(trama.crudaB64!, 'base64');
  const comoTexto = bytes.toString('latin1');
  // Imprimible = ASCII visible más los separadores que usan estos protocolos
  const esImprimible = /^[\x20-\x7E\r\n\x06\x14]*$/.test(comoTexto);
  return esImprimible
    ? { texto: comoTexto, codificacion: 'texto', bytes }
    : { texto: trama.crudaB64!, codificacion: 'base64', bytes };
}

export function registrarBridge(app: App) {
  const token = (process.env.BRIDGE_TOKEN ?? '').trim();

  app.addHook('onRequest', async (request, reply) => {
    if (!token) return reply.code(503).send({ error: 'BRIDGE_TOKEN no configurado en el servidor' });
    const cabecera = request.headers.authorization ?? '';
    if (cabecera !== `Bearer ${token}`) return reply.code(401).send({ error: 'Token de puente inválido' });
  });

  /** Lote de tramas crudas: se persisten todas y se procesan las que se entienden. */
  app.post('/bridge/senales', async (request, reply) => {
    const datos = esquemaLote.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });

    await registrarPuente({
      nombre: datos.data.bridge,
      fuente: datos.data.fuente,
      version: datos.data.version,
    });

    let procesadas = 0;
    let ignoradas = 0;
    let errores = 0;

    for (const trama of datos.data.tramas) {
      const recibidaEn = new Date();
      const { texto, codificacion } = normalizarTrama(trama);
      const comun = {
        fuente: 'pima-bridge' as const,
        remoto: trama.origen ?? datos.data.bridge,
        cruda: texto,
        codificacion,
        puertoLocal: trama.puerto,
      };

      /*
       * Una trama que no es texto imprimible no la entiende ninguno de nuestros
       * decodificadores: los protocolos propietarios (EBS y similares) viajan en
       * binario. Se guarda íntegra para poder estudiarla y NO abre alarma: si
       * abriera, un latido cada cinco segundos por equipo inundaría la cola.
       */
      if (codificacion === 'base64') {
        await registrarSenal({ ...comun, estadoParse: 'error', detalleError: 'trama binaria sin decodificador' });
        errores++;
        continue;
      }

      /*
       * El receptor PIMA de la central entrega su propio formato de dos
       * caracteres ("1061      7002    TH"), no el Sur-Gard clásico. Se prueba
       * primero porque es el que llega de verdad; el Sur-Gard queda como
       * respaldo para receptores de otras marcas.
       */
      const pima = parsearLineaPima(texto);
      if (pima) {
        const panelPima = await buscarPanelPorCuenta(pima.numeroCuenta);
        const senalIdPima = await registrarSenal({ ...comun, estadoParse: 'ok', panelId: panelPima?.id });
        await procesarEvento({
          senalId: senalIdPima,
          normalizado: interpretarPima({ numeroCuenta: pima.numeroCuenta, codigo: pima.codigo }),
          recibidaEn,
        });
        if (panelPima) await registrarVida(panelPima.id, recibidaEn);
        procesadas++;
        continue;
      }

      const resultado = parsearLineaSurgard(texto);

      if (resultado.tipo === 'latido') {
        // Latido del receptor: no es un evento, pero deja rastro de que la línea vive
        await registrarSenal({ ...comun, estadoParse: 'ignorada', detalleError: 'latido del receptor' });
        ignoradas++;
        continue;
      }

      if (resultado.tipo === 'desconocido') {
        await registrarSenal({ ...comun, estadoParse: 'error', detalleError: 'línea no reconocida' });
        errores++;
        continue;
      }

      const panelEncontrado = await buscarPanelPorCuenta(resultado.numeroCuenta);
      const senalId = await registrarSenal({
        ...comun,
        estadoParse: 'ok',
        detalleError: resultado.parseLaxo ? 'reconocida con el patrón de reserva: verificar formato' : undefined,
        panelId: panelEncontrado?.id,
      });

      const normalizado = interpretarCid({
        numeroCuenta: resultado.numeroCuenta,
        calificador: resultado.calificador,
        codigoCid: resultado.codigoCid,
        particion: resultado.particion,
        zona: resultado.zona,
      });
      await procesarEvento({ senalId, normalizado, recibidaEn });
      if (panelEncontrado) await registrarVida(panelEncontrado.id, recibidaEn);
      procesadas++;
    }

    return { recibidas: datos.data.tramas.length, procesadas, ignoradas, errores };
  });

  /** Latido del puente: sin esto, el vigilante lo da por caído. */
  app.post('/bridge/latido', async (request, reply) => {
    const datos = esquemaLatido.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    await registrarPuente({
      nombre: datos.data.bridge,
      fuente: datos.data.fuente,
      version: datos.data.version,
      tramasRecibidas: datos.data.tramasRecibidas,
    });
    return { ok: true };
  });
}

/** Listado de puentes para la consola (personal de la central). */
export function registrarBridgesConsulta(app: App) {
  app.addHook('onRequest', app.autenticar);
  app.addHook('onRequest', app.soloPersonal);

  app.get('/bridges', async () =>
    db
      .select({
        id: bridge.id,
        nombre: bridge.nombre,
        descripcion: bridge.descripcion,
        fuente: bridge.fuente,
        version: bridge.version,
        ultimoLatidoEn: bridge.ultimoLatidoEn,
        tramasRecibidas: bridge.tramasRecibidas,
        supervisado: bridge.supervisado,
        intervaloLatidoSeg: bridge.intervaloLatidoSeg,
        activo: bridge.activo,
        /** true si pasó más de 3 latidos sin dar señales de vida */
        silencioso: sql<boolean>`${bridge.supervisado} and ${bridge.activo} and coalesce(${bridge.ultimoLatidoEn}, ${bridge.creadoEn}) < now() - (${bridge.intervaloLatidoSeg} * 3 * interval '1 second')`,
      })
      .from(bridge)
      .orderBy(bridge.nombre),
  );

  /**
   * Diario de un puente: lo que entró por él, con su traducción al lado.
   * Es la "ventana" del puente vista desde la consola: cada trama cruda, si se
   * entendió, y qué evento produjo. Sirve para ver que el receptor está vivo y
   * que lo que llega se interpreta, sin tener que sentarse frente a esa PC.
   */
  app.get('/bridges/:id/diario', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const { limite } = request.query as { limite?: string };
    const max_ = Math.min(Number(limite ?? 150), 500);
    const [puente] = await db.select({ nombre: bridge.nombre }).from(bridge).where(eq(bridge.id, id)).limit(1);
    if (!puente) return reply.code(404).send({ error: 'Puente no encontrado' });

    const propias = and(eq(senal.fuente, 'pima-bridge'), eq(senal.remoto, puente.nombre));
    const [senales, [ultimas24h], [total]] = await Promise.all([
      db
        .select({
          id: senal.id,
          recibidaEn: senal.recibidaEn,
          cruda: senal.cruda,
          estadoParse: senal.estadoParse,
          detalleError: senal.detalleError,
          panelId: senal.panelId,
          codigo: evento.codigo,
          descripcion: evento.descripcion,
          categoria: evento.categoria,
          numeroCuenta: evento.numeroCuenta,
          prioridad: evento.prioridad,
        })
        .from(senal)
        .leftJoin(evento, eq(evento.senalId, senal.id))
        .where(propias)
        .orderBy(desc(senal.recibidaEn), desc(senal.id))
        .limit(max_),
      db
        .select({
          tramas: count(),
          sinInterpretar: sql<number>`count(*) filter (where ${senal.estadoParse} <> 'ok')`.mapWith(Number),
        })
        .from(senal)
        .where(and(propias, gte(senal.recibidaEn, sql`now() - interval '24 hours'`))),
      db.select({ ultimaTramaEn: max(senal.recibidaEn) }).from(senal).where(propias),
    ]);

    return {
      resumen: {
        ultimas24h: ultimas24h?.tramas ?? 0,
        sinInterpretar24h: ultimas24h?.sinInterpretar ?? 0,
        ultimaTramaEn: total?.ultimaTramaEn ?? null,
      },
      senales,
    };
  });

  app.put('/bridges/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const esquema = z.object({
      descripcion: z.string().optional(),
      supervisado: z.boolean().optional(),
      intervaloLatidoSeg: z.number().int().min(10).max(3600).optional(),
      activo: z.boolean().optional(),
    });
    const datos = esquema.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues });
    const [fila] = await db.update(bridge).set(datos.data).where(eq(bridge.id, id)).returning();
    if (!fila) return reply.code(404).send({ error: 'Puente no encontrado' });
    return fila;
  });
}
