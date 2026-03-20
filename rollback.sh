#!/usr/bin/env bash
set -euo pipefail

APP_NAME="agentes-flow-ui"
ROLLBACK_IMAGE="${APP_NAME}:rollback"
NETWORK_NAME="osmar_edge"

PASS() { echo "[PASS] $*"; }
FAIL() { echo "[FAIL] $*"; exit 1; }
INFO() { echo "[INFO] $*"; }

if ! docker image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
  FAIL "No existe imagen de rollback ($ROLLBACK_IMAGE). Ejecuta primero deploy.sh con un contenedor previo."
fi

INFO "Rollback: detener contenedor actual"
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true
PASS "Contenedor actual removido"

INFO "Rollback: levantar imagen previa"
docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  --network "$NETWORK_NAME" \
  --add-host "auth.openclaw.elroi.cloud:164.68.127.40" \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e POLL_INTERVAL_MS=5000 \
  -e DASH_PASSWORD="${FLOW_UI_DASH_PASSWORD:-change-me}" \
  -e AUTH_API_URL="https://auth.openclaw.elroi.cloud" \
  -e OPENCLAW_BIN="openclaw" \
  -e OPENCLAW_MJS="/usr/lib/node_modules/openclaw/openclaw.mjs" \
  -e OPENCLAW_HOME="/root/.openclaw" \
  -v /usr/lib/node_modules/openclaw:/usr/lib/node_modules/openclaw:ro \
  -v /root/.openclaw:/root/.openclaw:ro \
  -l traefik.enable=true \
  -l "traefik.http.routers.agents.rule=Host(\`agents.openclaw.elroi.cloud\`)" \
  -l traefik.http.routers.agents.entrypoints=websecure \
  -l traefik.http.routers.agents.tls=true \
  -l traefik.http.routers.agents.tls.certresolver=le \
  -l traefik.http.services.agents.loadbalancer.server.port=8080 \
  -l traefik.http.routers.agents.middlewares=security-headers \
  "$ROLLBACK_IMAGE" >/dev/null

sleep 3
code="$(docker exec "$APP_NAME" sh -lc "wget -qSO- --server-response http://127.0.0.1:8080/api/health -O /dev/null 2>&1 | awk '/HTTP\//{print \$2}' | tail -n1" || true)"
if [[ "$code" == "200" ]]; then
  PASS "Rollback OK: /api/health -> 200"
  echo "ROLLBACK RESULT: PASS ✅"
else
  FAIL "Rollback levantó contenedor pero /api/health devolvió $code"
fi