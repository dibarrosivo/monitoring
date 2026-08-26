import {
  bigserial,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const tipoPanelEnum = pgEnum('tipo_panel', ['hikvision', 'pima', 'ebm', 'otro']);
export const estadoParseEnum = pgEnum('estado_parse', ['ok', 'error', 'cifrada', 'ignorada']);
export const categoriaEventoEnum = pgEnum('categoria_evento', [
  'alarma',
  'restauracion',
  'apertura',
  'cierre',
  'averia',
  'anulacion',
  'prueba',
  'cancelacion',
  'sistema',
  'desconocido',
]);
export const estadoAlarmaEnum = pgEnum('estado_alarma', ['nueva', 'en_atencion', 'cerrada']);
export const tipoAccionEnum = pgEnum('tipo_accion', ['toma', 'nota', 'cierre', 'sistema']);
export const rolUsuarioEnum = pgEnum('rol_usuario', ['admin', 'operador', 'cliente']);

export const cliente = pgTable('cliente', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  telefono: text('telefono'),
  email: text('email'),
  direccion: text('direccion'),
  notas: text('notas'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const sitio = pgTable('sitio', {
  id: serial('id').primaryKey(),
  clienteId: integer('id_cliente')
    .notNull()
    .references(() => cliente.id),
  nombre: text('nombre').notNull(),
  direccion: text('direccion'),
  notas: text('notas'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const panel = pgTable(
  'panel',
  {
    id: serial('id').primaryKey(),
    sitioId: integer('id_sitio')
      .notNull()
      .references(() => sitio.id),
    /** Número de cuenta de abonado con el que transmite el panel (hex, 3-16) */
    numeroCuenta: varchar('numero_cuenta', { length: 16 }).notNull(),
    tipo: tipoPanelEnum('tipo').notNull().default('otro'),
    modelo: text('modelo'),
    /** Si está supervisado, la falta de señales genera una alarma de sistema */
    supervisado: boolean('supervisado').notNull().default(true),
    /** Minutos esperados entre pruebas periódicas / señales de vida */
    intervaloPruebaMin: integer('intervalo_prueba_min').notNull().default(1440),
    ultimaSenalEn: timestamp('ultima_senal_en', { withTimezone: true }),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('panel_numero_cuenta_unico').on(t.numeroCuenta)],
);

export const zona = pgTable(
  'zona',
  {
    id: serial('id').primaryKey(),
    panelId: integer('id_panel')
      .notNull()
      .references(() => panel.id),
    numero: varchar('numero', { length: 8 }).notNull(),
    particion: varchar('particion', { length: 4 }).notNull().default('01'),
    descripcion: text('descripcion'),
  },
  (t) => [uniqueIndex('zona_unica_por_panel').on(t.panelId, t.particion, t.numero)],
);

/** Diario crudo: toda trama recibida queda registrada antes de cualquier parseo. */
export const senal = pgTable(
  'senal',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    fuente: text('fuente').notNull(),
    remoto: text('remoto'),
    cruda: text('cruda').notNull(),
    estadoParse: estadoParseEnum('estado_parse').notNull(),
    detalleError: text('detalle_error'),
    panelId: integer('id_panel').references(() => panel.id),
    recibidaEn: timestamp('recibida_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('senal_recibida_en').on(t.recibidaEn)],
);

export const evento = pgTable(
  'evento',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    senalId: integer('id_senal').references(() => senal.id),
    panelId: integer('id_panel').references(() => panel.id),
    numeroCuenta: varchar('numero_cuenta', { length: 16 }),
    categoria: categoriaEventoEnum('categoria').notNull(),
    /** p. ej. 'E130', 'R401', 'SIS' para eventos de sistema */
    codigo: varchar('codigo', { length: 8 }).notNull(),
    descripcion: text('descripcion').notNull(),
    particion: varchar('particion', { length: 4 }),
    zona: varchar('zona', { length: 8 }),
    prioridad: integer('prioridad').notNull(),
    ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull(),
  },
  (t) => [index('evento_panel_fecha').on(t.panelId, t.ocurridoEn)],
);

export const usuario = pgTable('usuario', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  nombre: text('nombre').notNull(),
  hashClave: text('hash_clave').notNull(),
  rol: rolUsuarioEnum('rol').notNull().default('operador'),
  /** Solo para rol 'cliente': el cliente al que pertenece; su acceso queda acotado a él. */
  clienteId: integer('id_cliente').references(() => cliente.id),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const alarma = pgTable(
  'alarma',
  {
    id: serial('id').primaryKey(),
    eventoId: integer('id_evento')
      .notNull()
      .references(() => evento.id),
    panelId: integer('id_panel').references(() => panel.id),
    estado: estadoAlarmaEnum('estado').notNull().default('nueva'),
    prioridad: integer('prioridad').notNull(),
    operadorId: integer('id_operador').references(() => usuario.id),
    tomadaEn: timestamp('tomada_en', { withTimezone: true }),
    cerradaEn: timestamp('cerrada_en', { withTimezone: true }),
    resolucion: text('resolucion'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('alarma_estado').on(t.estado)],
);

export const accionAlarma = pgTable('accion_alarma', {
  id: serial('id').primaryKey(),
  alarmaId: integer('id_alarma')
    .notNull()
    .references(() => alarma.id),
  operadorId: integer('id_operador').references(() => usuario.id),
  tipo: tipoAccionEnum('tipo').notNull(),
  detalle: text('detalle'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Horario esperado de apertura/cierre de un panel. El vigilante genera eventos
 * de sistema ante apertura tarde, falta de cierre o apertura fuera de horario.
 * v1: horarios dentro del mismo día (apertura < cierre); un panel puede tener
 * varias filas para días distintos.
 */
export const horario = pgTable('horario', {
  id: serial('id').primaryKey(),
  panelId: integer('id_panel')
    .notNull()
    .references(() => panel.id),
  /** Días activos como 'LMXJVSD' con '-' en los días libres, p. ej. 'LMXJV--' */
  dias: varchar('dias', { length: 7 }).notNull(),
  apertura: time('apertura').notNull(),
  cierre: time('cierre').notNull(),
  toleranciaMin: integer('tolerancia_min').notNull().default(30),
  activo: boolean('activo').notNull().default(true),
});

export const contacto = pgTable('contacto', {
  id: serial('id').primaryKey(),
  clienteId: integer('id_cliente')
    .notNull()
    .references(() => cliente.id),
  sitioId: integer('id_sitio').references(() => sitio.id),
  nombre: text('nombre').notNull(),
  telefono: text('telefono').notNull(),
  /** Orden en la lista de llamadas del plan de acción */
  orden: integer('orden').notNull().default(1),
  palabraClave: text('palabra_clave'),
  notas: text('notas'),
});
