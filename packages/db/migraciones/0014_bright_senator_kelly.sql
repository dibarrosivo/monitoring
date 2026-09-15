DROP INDEX "panel_numero_cuenta_unico";--> statement-breakpoint
CREATE UNIQUE INDEX "panel_cuenta_por_via_unica" ON "panel" USING btree ("numero_cuenta","tipo");