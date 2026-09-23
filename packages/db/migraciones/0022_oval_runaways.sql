CREATE TABLE "preferencia_aviso" (
	"id_usuario" integer PRIMARY KEY NOT NULL,
	"armado_desarmado" boolean DEFAULT true NOT NULL,
	"averias" boolean DEFAULT true NOT NULL,
	"sistema" boolean DEFAULT true NOT NULL,
	"silencio_desde" time,
	"silencio_hasta" time,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preferencia_aviso" ADD CONSTRAINT "preferencia_aviso_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;