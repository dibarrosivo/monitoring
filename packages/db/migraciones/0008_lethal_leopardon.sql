CREATE TYPE "public"."estado_cliente" AS ENUM('activo', 'suspendido', 'baja');--> statement-breakpoint
CREATE TYPE "public"."propiedad_equipo" AS ENUM('propio', 'comodato', 'prestamo');--> statement-breakpoint
CREATE TYPE "public"."tipo_persona" AS ENUM('natural', 'juridico', 'gobierno', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_sitio" AS ENUM('residencial', 'comercial', 'industria', 'gobierno', 'apartamento', 'centro_comercial', 'otro');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"entidad" varchar(32) NOT NULL,
	"id_entidad" integer,
	"accion" varchar(16) NOT NULL,
	"cambios" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feriado" (
	"id" serial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"descripcion" text,
	CONSTRAINT "feriado_fecha_unique" UNIQUE("fecha")
);
--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "documento" text;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "tipo_persona" "tipo_persona" DEFAULT 'natural' NOT NULL;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "movil" text;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "estado" "estado_cliente" DEFAULT 'activo' NOT NULL;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "motivo_estado" text;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "estado_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "fecha_alta" date;--> statement-breakpoint
ALTER TABLE "contacto" ADD COLUMN "rol" text;--> statement-breakpoint
ALTER TABLE "contacto" ADD COLUMN "telefono_alternativo" text;--> statement-breakpoint
ALTER TABLE "contacto" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "contacto" ADD COLUMN "autorizado_cancelar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "prefijo" varchar(8);--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "alias" text;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "serial" text;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "clave_maestra" text;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "instalador" text;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "fecha_instalacion" date;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "propiedad" "propiedad_equipo" DEFAULT 'propio' NOT NULL;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "monto_abono" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "frecuencia_meses" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "proximo_vencimiento" date;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "tipo" "tipo_sitio" DEFAULT 'otro' NOT NULL;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "ciudad" text;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "referencia" text;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "latitud" double precision;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "longitud" double precision;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "telefono" text;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "llaves" text;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "punto_tag" text;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "instrucciones_acceso" text;--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "instrucciones" text;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_entidad" ON "auditoria" USING btree ("entidad","id_entidad");--> statement-breakpoint
CREATE INDEX "auditoria_fecha" ON "auditoria" USING btree ("creado_en");--> statement-breakpoint
-- Migrar el booleano viejo al estado comercial y sembrar la fecha de alta
UPDATE "cliente" SET "estado" = 'baja' WHERE "activo" = false;--> statement-breakpoint
UPDATE "cliente" SET "fecha_alta" = "creado_en"::date WHERE "fecha_alta" IS NULL;
