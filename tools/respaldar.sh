#!/usr/bin/env bash
#
# Respaldo diario de la base de datos de la central. Se ejecuta EN el VPS,
# desde cron (ver abajo). Deja un volcado comprimido en /opt/monitoring/respaldos
# con 30 días de historial y copia el más reciente a otra máquina, porque un
# respaldo que vive en el mismo servidor que la base no protege de perder el
# servidor.
#
#   /opt/monitoring/tools/respaldar.sh            respaldo normal
#   /opt/monitoring/tools/respaldar.sh --probar   además restaura el volcado en una
#                                                  base temporal y cuenta filas, para
#                                                  demostrar que sirve
#
# Cron sugerido (root), todos los días a las 03:30 hora del servidor:
#   30 3 * * * /opt/monitoring/tools/respaldar.sh >> /var/log/respaldo-monitoreo.log 2>&1
#
set -euo pipefail

CARPETA=/opt/monitoring/respaldos
DIAS_HISTORIAL=30
CONTENEDOR=monitoring-postgres-1
BASE=monitoring
USUARIO=monitoring
# Copia fuera del VPS: servidor Windows de la central, por SSH con llave propia
DESTINO_REMOTO="Administrator@156.67.31.152:C:/Respaldos/monitoreo/"
LLAVE_REMOTA=/root/.ssh/id_ed25519_respaldo

mkdir -p "$CARPETA"
fecha=$(date +%Y%m%d-%H%M)
archivo="$CARPETA/monitoring-$fecha.sql.gz"

echo "[$(date '+%F %T')] Volcando $BASE a $archivo"
docker exec "$CONTENEDOR" pg_dump -U "$USUARIO" --no-owner --no-privileges "$BASE" | gzip -9 > "$archivo"
tamano=$(du -h "$archivo" | cut -f1)
echo "[$(date '+%F %T')] Listo: $tamano"

# El volcado tiene que ser un gzip íntegro que termine como termina pg_dump
if ! gzip -t "$archivo" || ! zcat "$archivo" | tail -n 3 | grep -q "PostgreSQL database dump complete"; then
  echo "[$(date '+%F %T')] ERROR: el volcado está incompleto o corrupto" >&2
  exit 1
fi

# Historial: se borran los que pasan los 30 días
find "$CARPETA" -name 'monitoring-*.sql.gz' -mtime +"$DIAS_HISTORIAL" -delete

# Copia fuera del VPS. Si falla, el respaldo local igual queda; se avisa y sale con error
if [ -f "$LLAVE_REMOTA" ]; then
  if scp -q -i "$LLAVE_REMOTA" -o BatchMode=yes -o ConnectTimeout=20 "$archivo" "$DESTINO_REMOTO"; then
    echo "[$(date '+%F %T')] Copiado a $DESTINO_REMOTO"
  else
    echo "[$(date '+%F %T')] ERROR: no se pudo copiar el respaldo fuera del VPS" >&2
    exit 2
  fi
fi

# Prueba de restauración en una base temporal, para no fiarse de un archivo que nadie abrió
if [ "${1:-}" = "--probar" ]; then
  echo "[$(date '+%F %T')] Probando restaurar en una base temporal"
  docker exec "$CONTENEDOR" psql -U "$USUARIO" -d postgres -q -c "DROP DATABASE IF EXISTS prueba_respaldo" -c "CREATE DATABASE prueba_respaldo"
  zcat "$archivo" | docker exec -i "$CONTENEDOR" psql -U "$USUARIO" -d prueba_respaldo -q -v ON_ERROR_STOP=1 > /dev/null
  docker exec "$CONTENEDOR" psql -U "$USUARIO" -d prueba_respaldo -At -c \
    "select 'clientes '||count(*) from cliente union all select 'paneles '||count(*) from panel union all select 'eventos '||count(*) from evento union all select 'alarmas '||count(*) from alarma"
  docker exec "$CONTENEDOR" psql -U "$USUARIO" -d postgres -q -c "DROP DATABASE prueba_respaldo"
  echo "[$(date '+%F %T')] Restauración de prueba correcta"
fi
