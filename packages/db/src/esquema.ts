import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
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
export const estadoClienteEnum = pgEnum('estado_cliente', ['activo', 'suspendido', 'baja']);
export const tipoPersonaEnum = pgEnum('tipo_persona', ['natural', 'juridico', 'gobierno', 'otro']);
export const tipoSitioEnum = pgEnum('tipo_sitio', [
  'residencial',
  'comercial',
  'industria',
  'gobierno',
  'apartamento',
  'centro_comercial',
  'otro',
]);
export const propiedadEquipoEnum = pgEnum('propiedad_equipo', ['propio', 'comodato', 'prestamo']);

/** Parámetros de la central (clave/valor JSON): hombre muerto, y lo que venga. */
export const configuracion = pgTable('configuracion', {
  clave: varchar('clave', { length: 64 }).primaryKey(),
  valor: jsonb('valor').notNull(),
});

export const cliente = pgTable('cliente', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  /** C.I. / RIF / CUIT: identidad fiscal para facturar */
  documento: text('documento'),
  tipoPersona: tipoPersonaEnum('tipo_persona').notNull().default('natural'),
  telefono: text('telefono'),
  movil: text('movil'),
  email: text('email'),
  /** Dirección administrativa del cliente (la del lugar monitoreado va en el sitio) */
  direccion: text('direccion'),
  notas: text('notas'),
  /** Plan de acción: qué debe hacer el operador ante una alarma de este cliente */
  instrucciones: text('instrucciones'),
  /**
   * Estado comercial. 'suspendido' NO corta el monitoreo: las señales se
   * reciben y las alarmas se atienden igual; el estado se informa en el
   * tablero para la gestión administrativa.
   */
  estado: estadoClienteEnum('estado').notNull().default('activo'),
  motivoEstado: text('motivo_estado'),
  estadoDesde: timestamp('estado_desde', { withTimezone: true }),
  fechaAlta: date('fecha_alta'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * El lugar físico monitoreado. Un cliente con un solo sitio no lo ve: el alta
 * lo crea sola y la interfaz solo lo expone cuando hay más de uno.
 */
export const sitio = pgTable('sitio', {
  id: serial('id').primaryKey(),
  clienteId: integer('id_cliente')
    .notNull()
    .references(() => cliente.id),
  nombre: text('nombre').notNull(),
  tipo: tipoSitioEnum('tipo').notNull().default('otro'),
  direccion: text('direccion'),
  ciudad: text('ciudad'),
  /** Cómo llegar / entre qué calles: lo que el operador le dicta al móvil */
  referencia: text('referencia'),
  /** Punto estático en el mapa (sin seguimiento: eso es FleetView) */
  latitud: doublePrecision('latitud'),
  longitud: doublePrecision('longitud'),
  telefono: text('telefono'),
  /**
   * Huso horario del lugar (IANA, p. ej. 'America/Caracas'). Vacío = el del
   * servidor. Lo usa la supervisión de horarios para no equivocarse cuando
   * el sitio está en otra franja.
   */
  zonaHoraria: varchar('zona_horaria', { length: 64 }),
  /** Llaves en poder de la central y punto/tag de recorrida */
  llaves: text('llaves'),
  puntoTag: text('punto_tag'),
  instruccionesAcceso: text('instrucciones_acceso'),
  /** Plan de acción propio del sitio; si está, manda sobre el del cliente */
  instrucciones: text('instrucciones'),
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
    /**
     * Segundo número con el que el mismo equipo puede reportar (otra vía:
     * línea telefónica vs IP/GPRS). Sin esto, esas señales entrarían como
     * cuenta desconocida y el operador no sabría de quién son.
     */
    cuentaSecundaria: varchar('cuenta_secundaria', { length: 16 }),
    /** Prefijo con el que la central nombra la cuenta (AL-7048, EBS-7037…) */
    prefijo: varchar('prefijo', { length: 8 }),
    /** Nombre corriente del equipo, como lo pide el operador por teléfono */
    alias: text('alias'),
    tipo: tipoPanelEnum('tipo').notNull().default('otro'),
    marca: text('marca'),
    modelo: text('modelo'),
    serial: text('serial'),
    /** Clave maestra del panel (para el técnico y para verificaciones) */
    claveMaestra: text('clave_maestra'),
    instalador: text('instalador'),
    fechaInstalacion: date('fecha_instalacion'),
    propiedad: propiedadEquipoEnum('propiedad').notNull().default('propio'),
    /** Si está supervisado, la falta de señales genera una alarma de sistema */
    supervisado: boolean('supervisado').notNull().default(true),
    /** Minutos esperados entre pruebas periódicas / señales de vida */
    intervaloPruebaMin: integer('intervalo_prueba_min').notNull().default(1440),
    ultimaSenalEn: timestamp('ultima_senal_en', { withTimezone: true }),
    // Facturación por cuenta monitoreada: solo vencimiento y monto, sin facturas
    montoAbono: numeric('monto_abono', { precision: 12, scale: 2 }),
    frecuenciaMeses: integer('frecuencia_meses').notNull().default(1),
    proximoVencimiento: date('proximo_vencimiento'),
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

/**
 * Puente de la central: el programa que corre en la PC con el receptor PIMA
 * (o cualquier otro) y reenvía las tramas crudas. Se registra solo la primera
 * vez que se comunica; el silencio de un puente supervisado abre alarma.
 */
export const bridge = pgTable('bridge', {
  id: serial('id').primaryKey(),
  /** Identificador que envía el propio programa (p. ej. 'pc-central-1') */
  nombre: varchar('nombre', { length: 64 }).notNull().unique(),
  descripcion: text('descripcion'),
  /** 'serie' | 'tcp': de dónde toma las tramas el puente */
  fuente: varchar('fuente', { length: 16 }),
  version: varchar('version', { length: 16 }),
  ultimoLatidoEn: timestamp('ultimo_latido_en', { withTimezone: true }),
  /** Cuántas tramas reenvió desde que arrancó (lo informa el propio puente) */
  tramasRecibidas: integer('tramas_recibidas').notNull().default(0),
  supervisado: boolean('supervisado').notNull().default(true),
  intervaloLatidoSeg: integer('intervalo_latido_seg').notNull().default(60),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Catálogo de valores usados en los equipos (marcas, modelos, instaladores).
 * Se alimenta solo: al guardar un dispositivo con un valor nuevo, queda
 * disponible como sugerencia para el siguiente. Así se evita la ensalada de
 * "Bosch" / "BOSCH" / "bosh" sin obligar a mantener listas a mano.
 */
export const catalogo = pgTable(
  'catalogo',
  {
    id: serial('id').primaryKey(),
    /** 'marca' | 'modelo' | 'instalador' */
    tipo: varchar('tipo', { length: 24 }).notNull(),
    valor: text('valor').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('catalogo_unico').on(t.tipo, t.valor)],
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
    // Al depurar el diario crudo el evento sobrevive: ya lleva el contenido decodificado
    senalId: integer('id_senal').references(() => senal.id, { onDelete: 'set null' }),
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
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Permiso de un usuario de plataforma (rol 'cliente') sobre el árbol de un cliente.
 * Granularidad por fila: panelId ⇒ solo ese panel; si no, sitioId ⇒ solo ese sitio;
 * si ambos son NULL ⇒ todos los sitios y paneles del cliente. Un usuario puede
 * tener varias filas (varios clientes, o varios alcances dentro de uno).
 */
export const acceso = pgTable(
  'acceso',
  {
    id: serial('id').primaryKey(),
    usuarioId: integer('id_usuario')
      .notNull()
      .references(() => usuario.id),
    clienteId: integer('id_cliente')
      .notNull()
      .references(() => cliente.id),
    sitioId: integer('id_sitio').references(() => sitio.id),
    panelId: integer('id_panel').references(() => panel.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('acceso_usuario').on(t.usuarioId)],
);

/**
 * Usuario del panel físico: el número de código en el teclado (los eventos 4xx
 * de Contact ID reportan este número). No inicia sesión en nada; puede estar
 * vinculado opcionalmente a una persona de la lista de contactos.
 */
export const usuarioPanel = pgTable(
  'usuario_panel',
  {
    id: serial('id').primaryKey(),
    panelId: integer('id_panel')
      .notNull()
      .references(() => panel.id),
    /** Número de usuario tal como transmite el panel, normalizado a 3 dígitos ('005') */
    numero: varchar('numero', { length: 4 }).notNull(),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    contactoId: integer('id_contacto').references(() => contacto.id),
  },
  (t) => [uniqueIndex('usuario_panel_unico').on(t.panelId, t.numero)],
);

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
  /** Vínculo con el cliente: dueño, encargado, vecino… */
  rol: text('rol'),
  telefono: text('telefono').notNull(),
  telefonoAlternativo: text('telefono_alternativo'),
  email: text('email'),
  /** Orden en la lista de llamadas del plan de acción */
  orden: integer('orden').notNull().default(1),
  palabraClave: text('palabra_clave'),
  /** Si puede dar por cancelada una alarma al verificar con la central */
  autorizadoCancelar: boolean('autorizado_cancelar').notNull().default(false),
  notas: text('notas'),
  /** Opcional: esta persona también tiene cuenta de plataforma (la app) */
  usuarioId: integer('id_usuario').references(() => usuario.id),
});

/**
 * Feriados de la central: el supervisor de horarios los saltea, así un
 * comercio cerrado por feriado no dispara "apertura tarde" ni "sin cierre".
 */
export const feriado = pgTable('feriado', {
  id: serial('id').primaryKey(),
  fecha: date('fecha').notNull().unique(),
  descripcion: text('descripcion'),
});

/**
 * Auditoría de los cambios administrativos: quién tocó qué y cuándo. En una
 * empresa de seguridad, modificar una lista de llamadas o un plan de acción
 * es un hecho que hay que poder reconstruir.
 */
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    usuarioId: integer('id_usuario').references(() => usuario.id),
    /** 'cliente' | 'sitio' | 'panel' | 'contacto' | 'zona' | 'horario' | 'acceso' | 'usuario' */
    entidad: varchar('entidad', { length: 32 }).notNull(),
    entidadId: integer('id_entidad'),
    accion: varchar('accion', { length: 16 }).notNull(),
    /** Campos cambiados (antes/después) para poder reconstruir el estado */
    cambios: jsonb('cambios'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auditoria_entidad').on(t.entidad, t.entidadId), index('auditoria_fecha').on(t.creadoEn)],
);
