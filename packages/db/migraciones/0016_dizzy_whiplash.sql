-- El valor 'ebm' era un error de nombre: la marca es EBS. Renombrar conserva las filas.
ALTER TYPE "public"."tipo_panel" RENAME VALUE 'ebm' TO 'ebs';
