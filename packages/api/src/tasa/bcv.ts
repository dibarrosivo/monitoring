import { get as httpsGet } from 'node:https';
import { desc, eq } from 'drizzle-orm';
import { db, tasaCambio } from '@monitoring/db';
import { ZONA_HORARIA_POR_DEFECTO } from '@monitoring/shared';

/**
 * Tasa oficial del dólar: se lee de la portada del BCV (www.bcv.org.ve),
 * que publica el valor y la "Fecha Valor" desde la que rige. El BCV publica
 * por la tarde la tasa del día hábil siguiente, así que guardamos una fila
 * por fecha de valor y "la vigente" es la última cuya fecha ya llegó.
 */

export interface TasaLeida {
  valor: number;
  fechaValor: string;
}

export interface Tasa extends TasaLeida {
  fuente: string;
  obtenidoEn: Date;
}

const URL_BCV = process.env.BCV_URL ?? 'https://www.bcv.org.ve/';
const CADA_HORAS = Number(process.env.TASA_BCV_CADA_HORAS ?? 12);
/** Un salto mayor que esto entre dos lecturas es sospechoso: se guarda el aviso, no la tasa. */
const SALTO_MAXIMO = 0.25;

/** Saca el dólar y su fecha de valor del HTML de la portada. Puro, para probarlo con una página guardada. */
export function interpretarBcv(html: string): TasaLeida | null {
  const bloque = /<div id="dolar"[\s\S]*?<strong[^>]*>\s*([\d.]+,\d+)\s*<\/strong>/.exec(html);
  if (!bloque) return null;
  const valor = Number(bloque[1]!.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return null;
  // La fecha de valor viene después del bloque del dólar
  const resto = html.slice(bloque.index);
  const fecha = /Fecha Valor:[\s\S]*?content="(\d{4}-\d{2}-\d{2})/.exec(resto);
  if (!fecha) return null;
  return { valor: Math.round(valor * 10000) / 10000, fechaValor: fecha[1]! };
}

/**
 * Descarga la portada. El BCV sirve un certificado con cadena incompleta, así
 * que no se valida el emisor SOLO para este pedido (nunca a nivel global); la
 * comprobación de salto máximo de abajo limita lo que un intermediario podría
 * colar.
 */
export function descargarBcv(url = URL_BCV): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const pedido = httpsGet(url, { rejectUnauthorized: false, headers: { 'user-agent': 'Mozilla/5.0 (monitoreo FST)' }, timeout: 30_000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        rechazar(new Error(`BCV respondió ${res.statusCode}`));
        return;
      }
      const partes: Buffer[] = [];
      res.on('data', (p: Buffer) => partes.push(p));
      res.on('end', () => resolver(Buffer.concat(partes).toString('utf8')));
      res.on('error', rechazar);
    });
    pedido.on('timeout', () => pedido.destroy(new Error('BCV no respondió a tiempo')));
    pedido.on('error', rechazar);
  });
}

/** 'AAAA-MM-DD' de hoy en la hora de la central. */
function hoyCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: process.env.ZONA_HORARIA_CENTRAL ?? ZONA_HORARIA_POR_DEFECTO });
}

/** La tasa que rige hoy: la última cuya fecha de valor ya llegó. Null si nunca se cargó. */
export async function tasaVigente(moneda = 'USD'): Promise<Tasa | null> {
  const hoy = hoyCentral();
  const filas = await db.select().from(tasaCambio).where(eq(tasaCambio.moneda, moneda)).orderBy(desc(tasaCambio.fechaValor)).limit(5);
  const vigente = filas.find((f) => f.fechaValor <= hoy) ?? filas[filas.length - 1];
  return vigente ? { valor: Number(vigente.valor), fechaValor: vigente.fechaValor, fuente: vigente.fuente, obtenidoEn: vigente.obtenidoEn } : null;
}

/** Guarda una tasa para una fecha de valor (la reemplaza si ya existía). */
export async function guardarTasa(t: TasaLeida, fuente: 'bcv' | 'manual', moneda = 'USD'): Promise<void> {
  await db
    .insert(tasaCambio)
    .values({ moneda, valor: t.valor.toFixed(4), fechaValor: t.fechaValor, fuente, obtenidoEn: new Date() })
    .onConflictDoUpdate({ target: [tasaCambio.moneda, tasaCambio.fechaValor], set: { valor: t.valor.toFixed(4), fuente, obtenidoEn: new Date() } });
}

/** ¿La lectura nueva es creíble frente a la última guardada? Un salto de más del 25 % en un día no lo es. */
export function saltoCreible(nueva: number, anterior: number | null): boolean {
  if (anterior === null || anterior <= 0) return true;
  return Math.abs(nueva - anterior) / anterior <= SALTO_MAXIMO;
}

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

/** Lee el BCV y guarda la tasa. Devuelve qué pasó; nunca lanza. */
export async function actualizarTasa(log: Log): Promise<'guardada' | 'sin-cambio' | 'rechazada' | 'error'> {
  try {
    const leida = interpretarBcv(await descargarBcv());
    if (!leida) {
      log.warn({}, 'La portada del BCV no trae la tasa donde se esperaba (¿cambió la página?)');
      return 'error';
    }
    const [ultima] = await db.select().from(tasaCambio).where(eq(tasaCambio.moneda, 'USD')).orderBy(desc(tasaCambio.fechaValor)).limit(1);
    if (ultima && ultima.fechaValor === leida.fechaValor && Number(ultima.valor) === leida.valor) return 'sin-cambio';
    if (!saltoCreible(leida.valor, ultima ? Number(ultima.valor) : null)) {
      log.warn({ leida, anterior: ultima?.valor }, 'Tasa del BCV con un salto sospechoso: no se guarda, revisar a mano');
      return 'rechazada';
    }
    await guardarTasa(leida, 'bcv');
    log.info({ ...leida }, 'Tasa del BCV actualizada');
    return 'guardada';
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'No se pudo leer la tasa del BCV');
    return 'error';
  }
}

/** Arranca el bot: una lectura al iniciar y otra cada TASA_BCV_CADA_HORAS (12 por defecto). */
export function iniciarBotTasa(log: Log): () => void {
  if (!(CADA_HORAS > 0)) return () => {};
  const primera = setTimeout(() => void actualizarTasa(log), 5_000);
  const cada = setInterval(() => void actualizarTasa(log), CADA_HORAS * 3_600_000);
  primera.unref();
  cada.unref();
  return () => {
    clearTimeout(primera);
    clearInterval(cada);
  };
}
