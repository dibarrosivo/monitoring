CREATE TYPE "public"."categoria_evento" AS ENUM('alarma', 'restauracion', 'apertura', 'cierre', 'averia', 'anulacion', 'prueba', 'cancelacion', 'sistema', 'desconocido');--> statement-breakpoint
CREATE TYPE "public"."estado_alarma" AS ENUM('nueva', 'en_atencion', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."estado_parse" AS ENUM('ok', 'error', 'cifrada', 'ignorada');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('admin', 'operador');--> statement-breakpoint
CREATE TYPE "public"."tipo_accion" AS ENUM('toma', 'nota', 'cierre', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."tipo_panel" AS ENUM('hikvision', 'pima', 'ebm', 'otro');--> statement-breakpoint
CREATE TABLE "accion_alarma" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_alarma" integer NOT NULL,
	"id_operador" integer,
	"tipo" "tipo_accion" NOT NULL,
	"detalle" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alarma" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_evento" integer NOT NULL,
	"id_panel" integer,
	"estado" "estado_alarma" DEFAULT 'nueva' NOT NULL,
	"prioridad" integer NOT NULL,
	"id_operador" integer,
	"tomada_en" timestamp with time zone,
	"cerrada_en" timestamp with time zone,
	"resolucion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"email" text,
	"direccion" text,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacto" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_cliente" integer NOT NULL,
	"id_sitio" integer,
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	"orden" integer DEFAULT 1 NOT NULL,
	"palabra_clave" text,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "evento" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"id_senal" integer,
	"id_panel" integer,
	"numero_cuenta" varchar(16),
	"categoria" "categoria_evento" NOT NULL,
	"codigo" varchar(8) NOT NULL,
	"descripcion" text NOT NULL,
	"particion" varchar(4),
	"zona" varchar(8),
	"prioridad" integer NOT NULL,
	"ocurrido_en" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_sitio" integer NOT NULL,
	"numero_cuenta" varchar(16) NOT NULL,
	"tipo" "tipo_panel" DEFAULT 'otro' NOT NULL,
	"modelo" text,
	"supervisado" boolean DEFAULT true NOT NULL,
	"intervalo_prueba_min" integer DEFAULT 1440 NOT NULL,
	"ultima_senal_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "senal" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fuente" text NOT NULL,
	"remoto" text,
	"cruda" text NOT NULL,
	"estado_parse" "estado_parse" NOT NULL,
	"detalle_error" text,
	"id_panel" integer,
	"recibida_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sitio" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_cliente" integer NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"hash_clave" text NOT NULL,
	"rol" "rol_usuario" DEFAULT 'operador' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "zona" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_panel" integer NOT NULL,
	"numero" varchar(8) NOT NULL,
	"particion" varchar(4) DEFAULT '01' NOT NULL,
	"descripcion" text
);
--> statement-breakpoint
ALTER TABLE "accion_alarma" ADD CONSTRAINT "accion_alarma_id_alarma_alarma_id_fk" FOREIGN KEY ("id_alarma") REFERENCES "public"."alarma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accion_alarma" ADD CONSTRAINT "accion_alarma_id_operador_usuario_id_fk" FOREIGN KEY ("id_operador") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alarma" ADD CONSTRAINT "alarma_id_evento_evento_id_fk" FOREIGN KEY ("id_evento") REFERENCES "public"."evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alarma" ADD CONSTRAINT "alarma_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alarma" ADD CONSTRAINT "alarma_id_operador_usuario_id_fk" FOREIGN KEY ("id_operador") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_id_cliente_cliente_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_id_sitio_sitio_id_fk" FOREIGN KEY ("id_sitio") REFERENCES "public"."sitio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_senal_senal_id_fk" FOREIGN KEY ("id_senal") REFERENCES "public"."senal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel" ADD CONSTRAINT "panel_id_sitio_sitio_id_fk" FOREIGN KEY ("id_sitio") REFERENCES "public"."sitio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "senal" ADD CONSTRAINT "senal_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sitio" ADD CONSTRAINT "sitio_id_cliente_cliente_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zona" ADD CONSTRAINT "zona_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alarma_estado" ON "alarma" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "evento_panel_fecha" ON "evento" USING btree ("id_panel","ocurrido_en");--> statement-breakpoint
CREATE UNIQUE INDEX "panel_numero_cuenta_unico" ON "panel" USING btree ("numero_cuenta");--> statement-breakpoint
CREATE INDEX "senal_recibida_en" ON "senal" USING btree ("recibida_en");--> statement-breakpoint
CREATE UNIQUE INDEX "zona_unica_por_panel" ON "zona" USING btree ("id_panel","particion","numero");