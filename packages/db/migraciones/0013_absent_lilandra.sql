CREATE TYPE "public"."accion_comando" AS ENUM('armar', 'armar_casa', 'desarmar');--> statement-breakpoint
CREATE TYPE "public"."estado_comando" AS ENUM('pendiente', 'enviado', 'confirmado', 'fallido');--> statement-breakpoint
CREATE TABLE "comando" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_panel" integer NOT NULL,
	"id_usuario" integer,
	"accion" "accion_comando" NOT NULL,
	"particion" varchar(4) DEFAULT '01' NOT NULL,
	"estado" "estado_comando" DEFAULT 'pendiente' NOT NULL,
	"detalle" text,
	"id_evento_confirma" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comando" ADD CONSTRAINT "comando_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comando" ADD CONSTRAINT "comando_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comando" ADD CONSTRAINT "comando_id_evento_confirma_evento_id_fk" FOREIGN KEY ("id_evento_confirma") REFERENCES "public"."evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comando_panel" ON "comando" USING btree ("id_panel","creado_en");