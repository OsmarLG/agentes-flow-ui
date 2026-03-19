#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx no está disponible. Instala Node.js para usar http-server."
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "Aviso: ngrok no está instalado. Instalación sugerida:"
  echo "  npm i -g ngrok"
  echo "Luego ejecuta manualmente: ngrok http ${PORT}"
fi

echo "Levantando servidor local en http://localhost:${PORT}"
npx --yes http-server . -p "${PORT}" -c-1
