CREATE TABLE "contacto_web" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	"email" text,
	"mensaje" text,
	"motivo" varchar(24) DEFAULT 'contacto' NOT NULL,
	"origen_ip" varchar(64),
	"atendido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
