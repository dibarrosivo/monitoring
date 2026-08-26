CREATE TABLE "acceso" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"id_cliente" integer NOT NULL,
	"id_sitio" integer,
	"id_panel" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_panel" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_panel" integer NOT NULL,
	"numero" varchar(4) NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"id_contacto" integer
);
--> statement-breakpoint
ALTER TABLE "usuario" DROP CONSTRAINT "usuario_id_cliente_cliente_id_fk";
--> statement-breakpoint
ALTER TABLE "contacto" ADD COLUMN "id_usuario" integer;--> statement-breakpoint
ALTER TABLE "acceso" ADD CONSTRAINT "acceso_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceso" ADD CONSTRAINT "acceso_id_cliente_cliente_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceso" ADD CONSTRAINT "acceso_id_sitio_sitio_id_fk" FOREIGN KEY ("id_sitio") REFERENCES "public"."sitio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceso" ADD CONSTRAINT "acceso_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_panel" ADD CONSTRAINT "usuario_panel_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_panel" ADD CONSTRAINT "usuario_panel_id_contacto_contacto_id_fk" FOREIGN KEY ("id_contacto") REFERENCES "public"."contacto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acceso_usuario" ON "acceso" USING btree ("id_usuario");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_panel_unico" ON "usuario_panel" USING btree ("id_panel","numero");--> statement-breakpoint
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Preservar los accesos existentes antes de eliminar la columna vieja
INSERT INTO "acceso" ("id_usuario", "id_cliente") SELECT "id", "id_cliente" FROM "usuario" WHERE "id_cliente" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "usuario" DROP COLUMN "id_cliente";