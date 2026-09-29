CREATE TABLE "guardia" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"fecha" date NOT NULL,
	"desde" time NOT NULL,
	"hasta" time NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pauta_turno" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"activa" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pauta_turno_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "turno" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_pauta" integer NOT NULL,
	"id_usuario" integer NOT NULL,
	"dias" varchar(7) NOT NULL,
	"desde" time NOT NULL,
	"hasta" time NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardia" ADD CONSTRAINT "guardia_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_id_pauta_pauta_turno_id_fk" FOREIGN KEY ("id_pauta") REFERENCES "public"."pauta_turno"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardia_fecha" ON "guardia" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "turno_pauta" ON "turno" USING btree ("id_pauta");