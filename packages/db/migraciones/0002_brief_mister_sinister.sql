ALTER TYPE "public"."rol_usuario" ADD VALUE 'cliente';--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "id_cliente" integer;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_id_cliente_cliente_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;