CREATE TABLE "sesion_operador" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"ingreso_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_actividad_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(64),
	"agente" text
);
--> statement-breakpoint
ALTER TABLE "sesion_operador" ADD CONSTRAINT "sesion_operador_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sesion_operador_usuario" ON "sesion_operador" USING btree ("id_usuario","ingreso_en");