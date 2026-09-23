CREATE TABLE "dispositivo_push" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"token" text NOT NULL,
	"plataforma" varchar(16) DEFAULT 'android' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivo_push_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "dispositivo_push" ADD CONSTRAINT "dispositivo_push_id_usuario_usuario_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispositivo_push_usuario" ON "dispositivo_push" USING btree ("id_usuario");