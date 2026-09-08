CREATE TABLE "catalogo" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" varchar(24) NOT NULL,
	"valor" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "cuenta_secundaria" varchar(16);--> statement-breakpoint
ALTER TABLE "sitio" ADD COLUMN "zona_horaria" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "catalogo_unico" ON "catalogo" USING btree ("tipo","valor");