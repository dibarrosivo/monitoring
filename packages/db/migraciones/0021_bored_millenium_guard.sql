ALTER TABLE "panel" ALTER COLUMN "ventana_cancelacion_seg" SET DEFAULT 25;
--> statement-breakpoint
-- Los paneles que quedaron con el valor anterior por defecto pasan al nuevo
UPDATE "panel" SET "ventana_cancelacion_seg" = 25 WHERE "ventana_cancelacion_seg" = 45;
