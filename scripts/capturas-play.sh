#!/usr/bin/env bash
# Recursos gráficos de la ficha de Google Play.
#
# Las capturas salen de los harness de la consola, o sea con datos inventados:
# en una ficha pública no puede aparecer ningún cliente real.
#
# Requiere el harness andando:
#   cd packages/console && npx vite --port 5199 --strictPort
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CRUDAS="$RAIZ/packages/console/assets/play/crudas"
mkdir -p "$CRUDAS"

curl -sfo /dev/null http://localhost:5199/harness-cliente.html || {
  echo "El harness no responde en el 5199."
  echo "Levántelo con: cd packages/console && npx vite --port 5199 --strictPort"
  exit 1
}

# 360x640 por 3 = 1080x1920, que es 16:9 justo (lo que acepta Play sin discusión)
cap() {
  google-chrome --headless=new --no-sandbox --hide-scrollbars \
    --virtual-time-budget=6000 --force-device-scale-factor=3 --window-size=360,640 \
    --screenshot="$CRUDAS/$2" "http://localhost:5199/$1" >/dev/null 2>&1
}

cap "harness-cliente.html#inicio" inicio.png
cap "harness-cliente.html#avisos" avisos.png
cap "harness-cliente.html?tipo=hikvision#panel" panel.png
cap "harness-cliente.html#cuenta" cuenta.png

python3 "$RAIZ/scripts/fichas-play.py"
echo
echo "Recursos en packages/console/assets/play/"
