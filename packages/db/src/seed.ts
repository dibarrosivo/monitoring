/**
 * Datos iniciales: usuario administrador y un cliente de demostración con un
 * panel (cuenta 1234) que coincide con los escenarios del simulador.
 * Idempotente: se puede correr más de una vez.
 */
import { cliente, contacto, db, hashearClave, panel, pool, sitio, usuario, zona } from './index.js';

const CLAVE_ADMIN = process.env.CLAVE_ADMIN ?? 'admin123';

async function sembrar() {
  await db
    .insert(usuario)
    .values({
      email: 'admin@monitoring.local',
      nombre: 'Administrador',
      hashClave: hashearClave(CLAVE_ADMIN),
      rol: 'admin',
    })
    .onConflictDoNothing();

  const [clienteDemo] = await db
    .insert(cliente)
    .values({ nombre: 'Cliente Demo', telefono: '+000000000', notas: 'Cliente de demostración del seed' })
    .onConflictDoNothing()
    .returning();

  if (clienteDemo) {
    const [sitioDemo] = await db
      .insert(sitio)
      .values({ clienteId: clienteDemo.id, nombre: 'Casa central', direccion: 'Dirección de ejemplo 123' })
      .returning();

    const [panelDemo] = await db
      .insert(panel)
      .values({ sitioId: sitioDemo!.id, numeroCuenta: '1234', tipo: 'hikvision', modelo: 'AX Pro', intervaloPruebaMin: 1440 })
      .onConflictDoNothing()
      .returning();

    if (panelDemo) {
      await db.insert(zona).values([
        { panelId: panelDemo.id, numero: '015', descripcion: 'Puerta principal' },
        { panelId: panelDemo.id, numero: '016', descripcion: 'Sensor de movimiento living' },
      ]);
      await db.insert(contacto).values({
        clienteId: clienteDemo.id,
        sitioId: sitioDemo!.id,
        nombre: 'Contacto Demo',
        telefono: '+000000001',
        orden: 1,
        palabraClave: 'girasol',
      });
    }
  }

  console.log('Seed aplicado. Usuario: admin@monitoring.local / clave:', CLAVE_ADMIN);
}

sembrar()
  .catch((err) => {
    console.error('Error en el seed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
