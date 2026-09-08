CREATE TABLE "bridge" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(64) NOT NULL,
	"descripcion" text,
	"fuente" varchar(16),
	"version" varchar(16),
	"ultimo_latido_en" timestamp with time zone,
	"tramas_recibidas" integer DEFAULT 0 NOT NULL,
	"supervisado" boolean DEFAULT true NOT NULL,
	"intervalo_latido_seg" integer DEFAULT 60 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_nombre_unique" UNIQUE("nombre")
);
