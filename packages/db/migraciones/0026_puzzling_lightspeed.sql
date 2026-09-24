CREATE TABLE "envio_push" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_evento" integer NOT NULL,
	"id_usuario" integer NOT NULL,
	"id_dispositivo" integer,
	"resultado" varchar(16) NOT NULL,
	"detalle" text,
	"enviado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"recibido_en" timestamp with time zone,
	"voz" text
);
--> statement-breakpoint
ALTER TABLE "envio_push" ADD CONSTRAINT "envio_push_id_evento_evento_id_fk" FOREIGN KEY ("id_evento") REFERENCES "public"."evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envio_push" ADD CONSTRAINT "envio_push_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "envio_push_evento" ON "envio_push" USING btree ("id_evento");--> statement-breakpoint
CREATE INDEX "envio_push_usuario_fecha" ON "envio_push" USING btree ("id_usuario","enviado_en");