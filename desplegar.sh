#!/usr/bin/env bash
#
# Despliegue en el VPS. Se ejecuta EN el servidor, desde /opt/monitoring.
# Lo usan por igual el despliegue manual y el de GitHub Actions.
#
#   ./desplegar.sh
#
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.produccion.yml"

# ---------------------------------------------------------------------------
# Secretos: se generan UNA sola vez y sobreviven a los despliegues siguientes.
# Regenerarlos en cada despliegue invalidaría las sesiones abiertas y dejaría
# la base inaccesible, así que el archivo se crea solo si no existe.
# ---------------------------------------------------------------------------
if [ ! -f .env ]; then
  echo "Primer despliegue: generando .env con secretos nuevos"
  : "${DOMINIO_CONSOLA:?Defina DOMINIO_CONSOLA en el primer despliegue}"
  cat > .env <<EOF
DOMINIO_CONSOLA=${DOMINIO_CONSOLA}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRETO=$(openssl rand -hex 32)
BRIDGE_TOKEN=$(openssl rand -hex 32)
PUERTO_API=3000
PUERTO_DC09_TCP=9999
PUERTO_DC09_UDP=9999
DC09_CLAVE_AES=
RETENCION_SENALES_DIAS=365
NIVEL_LOG=info
EOF
  chmod 600 .env
else
  echo "Reutilizando el .env existente (los secretos no se regeneran)"
fi

# ---------------------------------------------------------------------------
# Se construye ANTES de tocar lo que está corriendo. Si la construcción falla,
# la central sigue recibiendo señales con la versión anterior.
# ---------------------------------------------------------------------------
echo "Construyendo imágenes"
$COMPOSE build

echo "Aplicando migraciones y levantando servicios"
$COMPOSE up -d --remove-orphans

# ---------------------------------------------------------------------------
# Verificación: un despliegue que deja el receptor caído es peor que no haber
# desplegado, así que se comprueba y se avisa con código de salida distinto.
# ---------------------------------------------------------------------------
echo "Esperando a que el receptor acepte conexiones"
for intento in $(seq 1 30); do
  if timeout 2 bash -c 'exec 3<>/dev/tcp/127.0.0.1/9999' 2>/dev/null; then
    echo "Receptor DC-09 respondiendo en el puerto 9999"
    $COMPOSE ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: el receptor no respondió tras 60 segundos" >&2
$COMPOSE ps
$COMPOSE logs --tail 40 receptor >&2
exit 1
