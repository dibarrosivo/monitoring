CREATE TABLE "tasa_cambio" (
	"id" serial PRIMARY KEY NOT NULL,
	"moneda" varchar(3) DEFAULT 'USD' NOT NULL,
	"valor" numeric(14, 4) NOT NULL,
	"fecha_valor" date NOT NULL,
	"fuente" varchar(16) DEFAULT 'bcv' NOT NULL,
	"obtenido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tasa_cambio_moneda_fecha" ON "tasa_cambio" USING btree ("moneda","fecha_valor");