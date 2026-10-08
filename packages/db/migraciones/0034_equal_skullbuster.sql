ALTER TABLE "preferencia_aviso" ADD COLUMN "personal_emergencias" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencia_aviso" ADD COLUMN "personal_fallas_central" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencia_aviso" ADD COLUMN "personal_informativos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencia_aviso" ADD COLUMN "personal_silencio_desde" time;--> statement-breakpoint
ALTER TABLE "preferencia_aviso" ADD COLUMN "personal_silencio_hasta" time;