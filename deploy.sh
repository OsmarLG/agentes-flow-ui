#!/usr/bin/env bash
set -euo pipefail

APP_NAME="agentes-flow-ui"
APP_IMAGE="${APP_NAME}:latest"
ROLLBACK_IMAGE="${APP_NAME}:rollback"
NETWORK_NAME="osmar_edge"
APP_HOST="agents.openclaw.elroi.cloud"
REPO_BRANCH="main"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR/.deploy"
BACKUP_FILE="$DEPLOY_DIR/previous_image.txt"

mkdir -p "$DEPLOY_DIR"

PASS() { echo "[PASS] $*"; }
FAIL() { echo "[FAIL] $*"; exit 1; }
INFO() { echo "[INFO] $*"; }

check_http_in_container() {
  local path="$1"
  local expected_mode="$2" # exact_200 | not_404
  local code
  code="$(docker exec "$APP_NAME" sh -lc "wget -qSO- --server-response http://127.0.0.1:8080${path} -O /dev/null 2>&1 | awk '/HTTP\//{print \$2}' | tail -n1" || true)"

  case "$expected_mode" in
    exact_200)
      [[ "$code" == "200" ]] && return 0 || return 1
      ;;
    not_404)
      [[ "$code" != "404" && -n "$code" ]] && return 0 || return 1
      ;;
    *)
      return 1
      ;;
  esac
}

check_post_login_route() {
  local code
  code="$(docker exec "$APP_NAME" sh -lc "wget -qSO- --server-response \\
    --header='Content-Type: application/json' \\
    --post-data='{\"password\":\"__healthcheck__\"}' \\
    http://127.0.0.1:8080/api/login -O /dev/null 2>&1 | grep 'HTTP/' | tail -n1 | cut -d' ' -f2" || true)"

  # Endpoint existe si no devuelve 404.
  [[ "$code" != "404" && -n "$code" ]]
}

INFO "1/6 git pull (branch: ${REPO_BRANCH})"
cd "$SCRIPT_DIR"
git fetch origin "$REPO_BRANCH"
git checkout "$REPO_BRANCH"
git pull --ff-only origin "$REPO_BRANCH"
PASS "Código actualizado en ${REPO_BRANCH}"

INFO "2/6 backup de imagen previa (si existe)"
if docker ps -a --format '{{.Names}}' | grep -qx "$APP_NAME"; then
  PREV_IMAGE_ID="$(docker inspect -f '{{.Image}}' "$APP_NAME")"
  if [[ -n "$PREV_IMAGE_ID" ]]; then
    docker tag "$PREV_IMAGE_ID" "$ROLLBACK_IMAGE"
    echo "$PREV_IMAGE_ID" > "$BACKUP_FILE"
    PASS "Backup listo: ${ROLLBACK_IMAGE} (${PREV_IMAGE_ID})"
  else
    INFO "No se pudo resolver imagen previa; rollback puede no estar disponible"
  fi
else
  INFO "No existe contenedor previo; se omite backup"
fi

INFO "3/6 docker build --no-cache"
cd "$SCRIPT_DIR"
docker build --no-cache -t "$APP_IMAGE" .
PASS "Imagen construida: $APP_IMAGE"

INFO "4/6 detener/eliminar contenedor anterior"
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true
PASS "Contenedor anterior removido (si existía)"

INFO "5/6 levantar contenedor nuevo (red + labels Traefik actuales)"
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
  -e OPENCLAW_BIN="/usr/lib/node_modules/openclaw/openclaw.mjs" \
  -v /usr/lib/node_modules/openclaw:/usr/lib/node_modules/openclaw:ro \
  -v /root/.openclaw:/root/.openclaw:ro \
  -l traefik.enable=true \
  -l "traefik.http.routers.agents.rule=Host(\`agents.openclaw.elroi.cloud\`)" \
  -l traefik.http.routers.agents.entrypoints=websecure \
  -l traefik.http.routers.agents.tls=true \
  -l traefik.http.routers.agents.tls.certresolver=le \
  -l traefik.http.services.agents.loadbalancer.server.port=8080 \
  -l traefik.http.routers.agents.middlewares=security-headers \
  "$APP_IMAGE" >/dev/null
PASS "Contenedor nuevo arriba"

INFO "6/6 validaciones post-deploy"
sleep 3

if check_http_in_container "/" exact_200; then
  PASS "GET / -> 200"
else
  FAIL "GET / no respondió 200"
fi

if check_http_in_container "/api/health" exact_200; then
  PASS "GET /api/health -> 200"
else
  FAIL "GET /api/health no respondió 200"
fi

if check_post_login_route; then
  PASS "POST /api/login existe (status != 404)"
else
  FAIL "POST /api/login no disponible"
fi

echo
echo "========================"
echo "DEPLOY RESULT: PASS ✅"
echo "Container: $APP_NAME"
echo "Image: $APP_IMAGE"
echo "========================"