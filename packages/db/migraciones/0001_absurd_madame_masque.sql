CREATE TABLE "horario" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_panel" integer NOT NULL,
	"dias" varchar(7) NOT NULL,
	"apertura" time NOT NULL,
	"cierre" time NOT NULL,
	"tolerancia_min" integer DEFAULT 30 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "horario" ADD CONSTRAINT "horario_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;