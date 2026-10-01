#!/bin/bash
# Empaqueta la app FST Alarma. Dos canales, a propósito separados:
#
#   AAB  → Google Play. Build normal, SIN el aviso de versión nueva.
#   APK  → instalación a mano desde el servidor de la central, CON el aviso.
#
# La política de Google Play (Device and Network Abuse) prohíbe que una app
# distribuida por la tienda se actualice bajando un APK por fuera, así que los
# dos builds se compilan por separado y el de la tienda no puede llevar el
# actualizador ni por descuido.
#
# Cada subida a Play exige un versionCode MAYOR al anterior:
#   packages/console/android/app/build.gradle → versionCode / versionName
#   packages/console/package.json             → version (el mismo versionName)
#
# La clave de firma vive FUERA del repositorio, en
# ~/dev/monitoring-secretos/firma.properties (ver su LEEME.txt). Sin ella la
# compilación de lanzamiento se detiene con un mensaje claro.
set -euo pipefail
cd "$(dirname "$0")/../packages/console"

FIRMA="${FALCON_FIRMA:-$HOME/dev/monitoring-secretos/firma.properties}"
[ -f "$FIRMA" ] || {
  echo "Falta la clave de firma: $FIRMA"
  echo "Está en el respaldo de ~/dev/monitoring-secretos (no se puede regenerar:"
  echo "una app ya publicada queda atada a su llave de subida)."
  exit 1
}

VC=$(grep -oE 'versionCode [0-9]+' android/app/build.gradle | grep -oE '[0-9]+')
VN=$(grep -oE 'versionName "[^"]+"' android/app/build.gradle | grep -oE '"[^"]+"' | tr -d '"')
VP=$(node -p "require('./package.json').version")

echo "── FST Alarma $VN (versionCode $VC) ──"
if [ "$VP" != "$VN" ]; then
  echo "AVISO: package.json dice $VP y build.gradle dice $VN."
  echo "       El aviso de versión del canal directo compara contra package.json:"
  echo "       si no coinciden, la app instalada no detecta la actualización."
fi

SOLO="${1:-ambos}"

if [ "$SOLO" != "directo" ]; then
  echo "── web para la tienda (sin aviso de versión) ──"
  npm run build
  npx cap sync android
  echo "── AAB de lanzamiento ──"
  ( cd android && ./gradlew bundleRelease --console=plain -q )
  AAB=android/app/build/outputs/bundle/release/app-release.aab
  cp "$AAB" "../../fst-alarma-$VN.aab"
  echo "✔ AAB para Play Console: fst-alarma-$VN.aab ($(du -h "$AAB" | cut -f1))"
fi

if [ "$SOLO" != "tienda" ]; then
  echo "── web del canal directo (con aviso de versión) ──"
  npm run build:directo
  npx cap sync android
  echo "── APK de lanzamiento ──"
  ( cd android && ./gradlew assembleRelease --console=plain -q )
  APK=android/app/build/outputs/apk/release/app-release.apk
  cp "$APK" "../../fst-alarma-$VN.apk"
  echo "✔ APK para instalar a mano: fst-alarma-$VN.apk ($(du -h "$APK" | cut -f1))"
  # Se deja el árbol en el estado del canal directo advertido, para que nadie
  # suba a la tienda un paquete compilado en el otro modo sin darse cuenta.
  echo
  echo "AVISO: el último build fue el del canal directo. Antes de subir a Play,"
  echo "       vuelva a correr este script (o 'bash scripts/empaquetar-android.sh tienda')."
fi
