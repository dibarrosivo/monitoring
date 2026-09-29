CREATE TABLE "cuota" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_cliente" integer NOT NULL,
	"id_panel" integer NOT NULL,
	"periodo_desde" date NOT NULL,
	"periodo_hasta" date NOT NULL,
	"vence_en" date NOT NULL,
	"monto_usd" numeric(12, 2) NOT NULL,
	"pagado_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"estado" varchar(16) DEFAULT 'pendiente' NOT NULL,
	"concepto" text NOT NULL,
	"avisada_en" timestamp with time zone,
	"aviso_mora_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pago" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_cliente" integer NOT NULL,
	"monto_usd" numeric(12, 2) NOT NULL,
	"monto_bs" numeric(14, 2),
	"tasa" numeric(14, 4),
	"forma" varchar(24) NOT NULL,
	"referencia" varchar(80),
	"fecha" date NOT NULL,
	"nota" text,
	"estado" varchar(16) DEFAULT 'confirmado' NOT NULL,
	"registrado_por" integer,
	"reportado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pago_cuota" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_pago" integer NOT NULL,
	"id_cuota" integer NOT NULL,
	"monto_usd" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"precio_usd" numeric(12, 2) NOT NULL,
	"frecuencia_meses" integer DEFAULT 1 NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "id_plan" integer;--> statement-breakpoint
ALTER TABLE "cuota" ADD CONSTRAINT "cuota_id_cliente_cliente_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuota" ADD CONSTRAINT "cuota_id_panel_panel_id_fk" FOREIGN KEY ("id_panel") REFERENCES "public"."panel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_id_cliente_cliente_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_reportado_por_usuario_id_fk" FOREIGN KEY ("reportado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_cuota" ADD CONSTRAINT "pago_cuota_id_pago_pago_id_fk" FOREIGN KEY ("id_pago") REFERENCES "public"."pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_cuota" ADD CONSTRAINT "pago_cuota_id_cuota_cuota_id_fk" FOREIGN KEY ("id_cuota") REFERENCES "public"."cuota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cuota_panel_periodo" ON "cuota" USING btree ("id_panel","periodo_desde");--> statement-breakpoint
CREATE INDEX "cuota_cliente_estado" ON "cuota" USING btree ("id_cliente","estado");--> statement-breakpoint
CREATE INDEX "pago_cliente_fecha" ON "pago" USING btree ("id_cliente","fecha");--> statement-breakpoint
CREATE INDEX "pago_cuota_pago" ON "pago_cuota" USING btree ("id_pago");--> statement-breakpoint
CREATE INDEX "pago_cuota_cuota" ON "pago_cuota" USING btree ("id_cuota");--> statement-breakpoint
ALTER TABLE "panel" ADD CONSTRAINT "panel_id_plan_plan_id_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;