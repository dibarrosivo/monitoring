/**
 * Usuarios de teclado traídos de 365 Connect Pro.
 *
 * El número que un panel reporta en una apertura o un cierre es el código del
 * teclado: sin esta tabla, el operador ve «usr 3» y no sabe quién entró. La
 * primera carga se hizo el 2026-09-19 junto con zonas, contactos y horarios;
 * esto completa lo que haya quedado afuera y sirve para volver a correrlo si
 * aparece algo más.
 *
 * La fuente es el respaldo definitivo del servidor Windows, no el servidor:
 * ~/Respaldos/365-servidor-2026-09-26/365-tablas-tsv.zip, que trae las 109
 * tablas en texto. Se usan tres:
 *   t365_Usuarios  — el código del teclado (cod_user) y la persona
 *   t365_Clientes  — para pasar del id_cliente de 365 a nuestro número de cuenta
 *   t365_TypeUser  — el parentesco o cargo, solo para mostrarlo al revisar
 *
 * Una cuenta puede tener VARIOS paneles nuestros (la 7037 entra por EBS y por
 * Hikvision, que son dos vías del mismo sitio): los usuarios se cargan en todos,
 * porque la señal puede llegar por cualquiera de las dos.
 *
 * Uso:
 *   DATABASE_URL=... tsx scripts/importar-usuarios-365.ts --tablas <carpeta>
 *   DATABASE_URL=... tsx scripts/importar-usuarios-365.ts --tablas <carpeta> --de-verdad
 */
import { parseArgs } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { db, pool, panel, usuarioPanel } from '@monitoring/db';

const { values } = parseArgs({
  options: { tablas: { type: 'string' }, 'de-verdad': { type: 'boolean', default: false } },
});
const CARPETA = values.tablas;
const DE_VERDAD = values['de-verdad'];

if (!CARPETA) {
  console.error('Falta --tablas <carpeta con los t365_*.tsv>');
  console.error('Se saca de 365-tablas-tsv.zip del respaldo del 2026-09-26.');
  process.exit(1);
}

/** Los TSV salen de SQL Server con BOM y fin de línea de Windows. */
function leerTabla(nombre: string): Record<string, string>[] {
  const archivo = readdirSync(CARPETA!).find((f) => f.toLowerCase() === `t365_${nombre.toLowerCase()}.tsv`);
  if (!archivo) throw new Error(`No está t365_${nombre}.tsv en ${CARPETA}`);
  const texto = readFileSync(join(CARPETA!, archivo), 'utf8').replace(/^﻿/, '');
  const [cabecera, ...lineas] = texto.split(/\r?\n/).filter((l) => l.length > 0);
  const columnas = cabecera!.split('\t');
  return lineas.map((l) => {
    const campos = l.split('\t');
    return Object.fromEntries(columnas.map((c, i) => [c, campos[i] ?? '']));
  });
}

function limpio(s: string | undefined): string {
  return (s ?? '').trim();
}

async function main(): Promise<void> {
  const clientes = new Map(leerTabla('Clientes').map((c) => [limpio(c.id_cliente), limpio(c.cuenta)]));
  const tipos = new Map(leerTabla('TypeUser').map((t) => [limpio(t.id_type_user), limpio(t.descrip)]));

  // Nuestros paneles, agrupados por número de cuenta
  const panelesPorCuenta = new Map<string, { id: number; prefijo: string | null }[]>();
  for (const p of await db.select({ id: panel.id, numeroCuenta: panel.numeroCuenta, prefijo: panel.prefijo }).from(panel)) {
    const lista = panelesPorCuenta.get(p.numeroCuenta) ?? [];
    lista.push({ id: p.id, prefijo: p.prefijo });
    panelesPorCuenta.set(p.numeroCuenta, lista);
  }

  const yaCargados = new Set(
    (await db.select({ panelId: usuarioPanel.panelId, numero: usuarioPanel.numero }).from(usuarioPanel)).map(
      (u) => `${u.panelId}:${u.numero}`,
    ),
  );

  const descartes = new Map<string, number>();
  const descartar = (motivo: string) => descartes.set(motivo, (descartes.get(motivo) ?? 0) + 1);

  /*
   * 365 repite filas del mismo código para una cuenta (la misma persona cargada
   * dos veces). Se queda la última, que es como lo resolvía su propia interfaz.
   */
  const porCuenta = new Map<string, Map<string, { nombre: string; tipo: string; telefono: string }>>();
  for (const u of leerTabla('Usuarios')) {
    const cuenta = clientes.get(limpio(u.id_cliente));
    if (!cuenta || !panelesPorCuenta.has(cuenta)) continue;
    const nombre = [limpio(u.nombre), limpio(u.apellido)].filter((x) => x && x !== '0').join(' ');
    const codigo = limpio(u.cod_user);
    if (!nombre) {
      descartar('fila sin nombre');
      continue;
    }
    if (!/^\d{1,3}$/.test(codigo)) {
      descartar(`código que un panel no puede transmitir (${codigo || 'vacío'})`);
      continue;
    }
    const mapa = porCuenta.get(cuenta) ?? new Map();
    mapa.set(codigo.padStart(3, '0'), { nombre, tipo: tipos.get(limpio(u.id_type_user)) ?? '', telefono: limpio(u.movil) });
    porCuenta.set(cuenta, mapa);
  }

  const altas: { panelId: number; numero: string; nombre: string; telefono: string | null; donde: string; tipo: string }[] = [];
  for (const [cuenta, usuarios] of porCuenta) {
    for (const p of panelesPorCuenta.get(cuenta)!) {
      for (const [numero, datos] of usuarios) {
        if (yaCargados.has(`${p.id}:${numero}`)) continue;
        altas.push({
          panelId: p.id,
          numero,
          nombre: datos.nombre,
          telefono: datos.telefono || null,
          donde: `${p.prefijo ? `${p.prefijo}-` : ''}${cuenta} (panel ${p.id})`,
          tipo: datos.tipo,
        });
      }
    }
  }

  console.log('');
  if (descartes.size) {
    console.log('  Filas de 365 que no se cargan:');
    for (const [motivo, n] of descartes) console.log(`    ${String(n).padStart(5)}  ${motivo}`);
    console.log('');
  }
  if (altas.length === 0) {
    console.log('  No hay nada que agregar: ya está cargado todo lo que 365 tiene para nuestras cuentas.');
    await pool.end();
    return;
  }

  console.log(`  ${altas.length} altas:`);
  let anterior = '';
  for (const a of altas.sort((x, y) => x.donde.localeCompare(y.donde) || x.numero.localeCompare(y.numero))) {
    if (a.donde !== anterior) console.log(`    ${a.donde}`);
    anterior = a.donde;
    console.log(`        ${a.numero}  ${a.nombre}${a.tipo ? `  [${a.tipo}]` : ''}`);
  }
  console.log('');

  if (!DE_VERDAD) {
    console.log('  Esto es lo que se agregaría. Nada se tocó.');
    console.log('  Para hacerlo: agregue --de-verdad');
    await pool.end();
    return;
  }

  await db.insert(usuarioPanel).values(altas.map(({ panelId, numero, nombre, telefono }) => ({ panelId, numero, nombre, telefono })));
  console.log(`  Agregados ${altas.length}.`);
  await pool.end();
}

await main();
