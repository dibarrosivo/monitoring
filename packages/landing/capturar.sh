#!/usr/bin/env bash
# Regenera las capturas de la landing desde los harness de la consola.
# Requiere: cd packages/console && npx vite --port 5199 --strictPort
set -e
M="$(cd "$(dirname "$0")" && pwd)/media"
mkdir -p "$M/claro"
cap() { google-chrome --headless=new --no-sandbox --hide-scrollbars --virtual-time-budget=6000 --force-device-scale-factor=$4 --window-size=$3 --screenshot="$5/$2" "http://localhost:5199/$1" >/dev/null 2>&1; }
for tema in oscuro claro; do
  if [ $tema = claro ]; then Q="?tema=claro"; D="$M/claro"; else Q=""; D="$M"; fi
  cap "harness-cola.html$Q" central-cola.png "1600,700" 1.35 "$D"
  cap "harness-dispositivo.html$Q" central-dispositivo.png "1600,900" 1.35 "$D"
  cap "harness-cliente.html$Q#inicio" app-inicio.png "360,779" 2 "$D"
  cap "harness-cliente.html$Q#avisos" app-avisos.png "360,779" 2 "$D"
  cap "harness-cliente.html?tipo=hikvision&${Q#?}#panel" app-panel.png "360,779" 2 "$D"
  cap "harness-cliente.html$Q#cuenta" app-cuenta.png "360,779" 2 "$D"
done
echo "capturas en $M"
