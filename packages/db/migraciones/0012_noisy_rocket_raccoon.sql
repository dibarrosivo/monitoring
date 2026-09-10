CREATE TYPE "public"."desenlace_alarma" AS ENUM('resuelta', 'falsa_alarma', 'escalada');--> statement-breakpoint
ALTER TYPE "public"."tipo_accion" ADD VALUE 'paso';--> statement-breakpoint
ALTER TABLE "alarma" ADD COLUMN "desenlace" "desenlace_alarma";