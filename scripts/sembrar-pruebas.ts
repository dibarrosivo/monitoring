/**
 * Cliente «Pruebas» para el período de testing de Google Play.
 *
 * Google exige credenciales para que su revisor pueda entrar a la app, y los
 * testers del período de pruebas cerradas necesitan ver algo al abrirla. Esto
 * crea un cliente inventado con un panel, sus zonas y un usuario de la app.
 * El historial lo va llenando tools/simulator/src/panelPruebas.ts.
 *
 * Es idempotente: si ya existe, no duplica nada y vuelve a imprimir los datos.
 *
 * ES DEUDA CON FECHA DE VENCIMIENTO. Al terminar el período:
 *   bash scripts/borrar-pruebas.sh
 *
 * Uso:
 *   DATABASE_URL=... tsx scripts/sembrar-pruebas.ts
 *   DATABASE_URL=... tsx scripts/sembrar-pruebas.ts --clave miClaveSegura
 */
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pool, cliente, sitio, panel, zona, usuario, acceso, hashearClave } from '@monitoring/db';

const { values } = parseArgs({ options: { clave: { type: 'string' } } });

const NOMBRE = 'Pruebas';
const CORREO = 'pruebas@falconseguridadtotal.com';
const CUENTA = '5199'; // del rango inventado 51xx, el mismo que usan los harness

const ZONAS = [
  { numero: '001', descripcion: 'Puerta principal' },
  { numero: '002', descripcion: 'Salón' },
  { numero: '003', descripcion: 'Oficina' },
  { numero: '007', descripcion: 'Depósito' },
];

async function main(): Promise<void> {
  const clave = values.clave ?? randomBytes(6).toString('base64url');

  const [existente] = await db.select().from(cliente).where(eq(cliente.nombre, NOMBRE)).limit(1);
  const filaCliente =
    existente ??
    (
      await db
        .insert(cliente)
        .values({
          nombre: NOMBRE,
          notas: 'Cliente inventado para el período de pruebas de Google Play. Se borra al terminar (scripts/borrar-pruebas.sh).',
          instrucciones: 'NO ES UN CLIENTE REAL. No llamar a nadie ni despachar nada por sus señales.',
          // Exonerado para que el generador de cuotas no le arme cobros
          exonerado: true,
        })
        .returning()
    )[0]!;

  const [sitioViejo] = await db.select().from(sitio).where(eq(sitio.clienteId, filaCliente.id)).limit(1);
  const filaSitio =
    sitioViejo ??
    (
      await db
        .insert(sitio)
        .values({
          clienteId: filaCliente.id,
          nombre: 'Local de pruebas',
          tipo: 'comercial',
          direccion: 'Sin dirección (cuenta de prueba)',
          ciudad: 'Santa Ana de Coro',
          zonaHoraria: 'America/Caracas',
        })
        .returning()
    )[0]!;

  const [panelViejo] = await db.select().from(panel).where(eq(panel.numeroCuenta, CUENTA)).limit(1);
  const filaPanel =
    panelViejo ??
    (
      await db
        .insert(panel)
        .values({
          sitioId: filaSitio.id,
          numeroCuenta: CUENTA,
          prefijo: 'AL',
          alias: 'Panel de pruebas',
          tipo: 'otro',
          marca: 'Simulado',
          // Sin supervisión: si el simulador se cae, no queremos una alarma de
          // sistema en la cola de los operadores por una cuenta que no existe
          supervisado: false,
          intervaloPruebaMin: 360,
          exonerado: true,
        })
        .returning()
    )[0]!;

  // Las zonas se cargan todas o ninguna: si el panel ya tiene alguna, no se toca
  const zonasExistentes = await db.select().from(zona).where(eq(zona.panelId, filaPanel.id));
  if (zonasExistentes.length === 0) {
    await db.insert(zona).values(ZONAS.map((z) => ({ panelId: filaPanel.id, numero: z.numero, particion: '01', descripcion: z.descripcion })));
  }
  const cuantasZonas = zonasExistentes.length || ZONAS.length;

  const [usuarioViejo] = await db.select().from(usuario).where(eq(usuario.email, CORREO)).limit(1);
  const filaUsuario = usuarioViejo
    ? (await db.update(usuario).set({ hashClave: hashearClave(clave), activo: true }).where(eq(usuario.id, usuarioViejo.id)).returning())[0]!
    : (
        await db
          .insert(usuario)
          .values({ email: CORREO, nombre: 'Cuenta de pruebas', hashClave: hashearClave(clave), rol: 'cliente' })
          .returning()
      )[0]!;

  const [accesoViejo] = await db.select().from(acceso).where(eq(acceso.usuarioId, filaUsuario.id)).limit(1);
  if (!accesoViejo) {
    await db.insert(acceso).values({ usuarioId: filaUsuario.id, clienteId: filaCliente.id, propietario: true });
  }

  console.log('');
  console.log('  Cliente de pruebas listo');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  Cliente   ${filaCliente.nombre} (id ${filaCliente.id})`);
  console.log(`  Sitio     ${filaSitio.nombre} (id ${filaSitio.id})`);
  console.log(`  Panel     AL-${CUENTA} (id ${filaPanel.id}), ${cuantasZonas} zonas`);
  console.log(`  Usuario   ${CORREO}`);
  console.log(`  Clave     ${clave}`);
  console.log('');
  console.log('  Esto va en el formulario «Acceso a la app» del Play Console');
  console.log('  y se le entrega a los testers. Guárdelo: la clave solo se');
  console.log('  muestra acá (volver a correr el script la cambia).');
  console.log('');
  await pool.end();
}

await main();
