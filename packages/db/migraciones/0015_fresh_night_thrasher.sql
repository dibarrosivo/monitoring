ALTER TYPE "public"."tipo_accion" ADD VALUE 'llamada';--> statement-breakpoint
ALTER TABLE "alarma" ADD COLUMN "motivo" varchar(32);