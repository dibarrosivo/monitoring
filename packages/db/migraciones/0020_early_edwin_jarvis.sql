ALTER TABLE "alarma" ADD COLUMN "en_verificacion_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "en_prueba_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "en_prueba_motivo" text;--> statement-breakpoint
ALTER TABLE "panel" ADD COLUMN "ventana_cancelacion_seg" integer DEFAULT 45 NOT NULL;