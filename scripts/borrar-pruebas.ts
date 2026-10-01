/**
 * Borra el cliente «Pruebas» y todo lo que colgó de él durante el período de
 * testing de Google Play: su sitio, su panel, sus zonas, sus señales, sus
 * eventos y el usuario de la app.
 *
 * El orden de borrado NO está escrito a mano. Se lee del propio Postgres qué
 * tablas apuntan a cliente, sitio, panel y usuario, y se va borrando por
 * pasadas hasta que no quede nada: así sigue funcionando aunque el esquema
 * cambie entre que se escribió esto y el día en que se corra, que puede ser
 * meses después. Todo va en una transacción: si algo falla, no se borra nada.
 *
 * Uso:
 *   DATABASE_URL=... tsx scripts/borrar-pruebas.ts            (muestra qué borraría)
 *   DATABASE_URL=... tsx scripts/borrar-pruebas.ts --de-verdad
 */
import { parseArgs } from 'node:util';
import { pool } from '@monitoring/db';

const { values } = parseArgs({ options: { 'de-verdad': { type: 'boolean', default: false } } });
const DE_VERDAD = values['de-verdad'];

const NOMBRE = 'Pruebas';
const CORREO = 'pruebas@falconseguridadtotal.com';

interface Referencia {
  tabla: string;
  columna: string;
  destino: string;
}

/** Todas las columnas que apuntan a estas tablas, según el propio Postgres. */
async function referencias(destinos: string[]): Promise<Referencia[]> {
  const { rows } = await pool.query<Referencia>(
    `SELECT origen.relname AS tabla, att.attname AS columna, destino.relname AS destino
       FROM pg_constraint c
       JOIN pg_class origen ON origen.oid = c.conrelid
       JOIN pg_class destino ON destino.oid = c.confrelid
       JOIN unnest(c.conkey) AS k(attnum) ON true
       JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
      WHERE c.contype = 'f' AND destino.relname = ANY($1)`,
    [destinos],
  );
  return rows;
}

async function main(): Promise<void> {
  const cliente = await pool.query<{ id: number }>('SELECT id FROM cliente WHERE nombre = $1', [NOMBRE]);
  const usuario = await pool.query<{ id: number }>('SELECT id FROM usuario WHERE email = $1', [CORREO]);
  if (cliente.rowCount === 0 && usuario.rowCount === 0) {
    console.log(`No hay nada que borrar: ni cliente «${NOMBRE}» ni usuario ${CORREO}.`);
    await pool.end();
    return;
  }

  const idsCliente = cliente.rows.map((r) => r.id);
  const idsUsuario = usuario.rows.map((r) => r.id);
  const sitios = idsCliente.length
    ? (await pool.query<{ id: number }>('SELECT id FROM sitio WHERE id_cliente = ANY($1)', [idsCliente])).rows.map((r) => r.id)
    : [];
  const paneles = sitios.length
    ? (await pool.query<{ id: number }>('SELECT id FROM panel WHERE id_sitio = ANY($1)', [sitios])).rows.map((r) => r.id)
    : [];

  const ids: Record<string, number[]> = { cliente: idsCliente, sitio: sitios, panel: paneles, usuario: idsUsuario };
  console.log(`Cliente ${idsCliente.join(', ') || '—'} · sitios ${sitios.join(', ') || '—'} · paneles ${paneles.join(', ') || '—'} · usuario ${idsUsuario.join(', ') || '—'}`);

  // Las cuatro tablas de arriba se borran al final, en este orden
  const refs = (await referencias(Object.keys(ids))).filter((r) => !(r.tabla in ids && r.columna === 'id'));

  const conexion = await pool.connect();
  try {
    await conexion.query('BEGIN');
    const borrado: Record<string, number> = {};

    // Pasadas sucesivas: lo que no se puede borrar todavía por una clave
    // foránea se reintenta en la vuelta siguiente, cuando sus hijos ya no estén
    let pendientes = refs.filter((r) => ids[r.destino]!.length > 0);
    for (let pasada = 1; pasada <= 12 && pendientes.length; pasada++) {
      const fallaron: Referencia[] = [];
      for (const r of pendientes) {
        await conexion.query('SAVEPOINT intento');
        try {
          const res = await conexion.query(`DELETE FROM "${r.tabla}" WHERE "${r.columna}" = ANY($1)`, [ids[r.destino]]);
          await conexion.query('RELEASE SAVEPOINT intento');
          if (res.rowCount) borrado[r.tabla] = (borrado[r.tabla] ?? 0) + res.rowCount;
        } catch {
          await conexion.query('ROLLBACK TO SAVEPOINT intento');
          fallaron.push(r);
        }
      }
      if (fallaron.length === pendientes.length) {
        throw new Error(`No se pudo borrar: ${fallaron.map((f) => `${f.tabla}.${f.columna}`).join(', ')}`);
      }
      pendientes = fallaron;
    }

    for (const [tabla, columna, valores] of [
      ['panel', 'id', paneles],
      ['sitio', 'id', sitios],
      ['cliente', 'id', idsCliente],
      ['usuario', 'id', idsUsuario],
    ] as const) {
      if (!valores.length) continue;
      const res = await conexion.query(`DELETE FROM "${tabla}" WHERE "${columna}" = ANY($1)`, [valores]);
      if (res.rowCount) borrado[tabla] = (borrado[tabla] ?? 0) + res.rowCount;
    }

    console.log('');
    for (const [tabla, n] of Object.entries(borrado).sort()) console.log(`  ${String(n).padStart(7)}  ${tabla}`);
    console.log('');

    if (DE_VERDAD) {
      await conexion.query('COMMIT');
      console.log('Borrado.');
    } else {
      await conexion.query('ROLLBACK');
      console.log('Esto es lo que se borraría. Nada se tocó.');
      console.log('Para hacerlo de verdad: tsx scripts/borrar-pruebas.ts --de-verdad');
    }
  } catch (e) {
    await conexion.query('ROLLBACK');
    throw e;
  } finally {
    conexion.release();
    await pool.end();
  }
}

await main();
