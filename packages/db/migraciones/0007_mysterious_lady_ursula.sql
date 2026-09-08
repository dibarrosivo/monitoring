ALTER TABLE "evento" DROP CONSTRAINT "evento_id_senal_senal_id_fk";
--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_senal_senal_id_fk" FOREIGN KEY ("id_senal") REFERENCES "public"."senal"("id") ON DELETE set null ON UPDATE no action;