# DEPLOY manual estandarizado (`agentes-flow-ui`)

Este documento define el deploy manual único y reproducible para evitar errores humanos.

## Archivos

- `deploy.sh` → deploy completo (pull, build, recreate, validación)
- `rollback.sh` → rollback a imagen previa respaldada por `deploy.sh`
- `.deploy/previous_image.txt` → metadata del último backup local

## Requisitos

- Docker funcionando en el servidor
- Red Docker existente: `osmar_edge`
- Repo clonado en: `projects/agentes-flow-ui`
- Permisos para ejecutar Docker

## Comando final de deploy (one-liner)

```bash
cd /root/.openclaw/agents-workspaces/elroi-dev/projects/agentes-flow-ui && chmod +x deploy.sh rollback.sh && ./deploy.sh
```

## ¿Qué hace `deploy.sh`?

1. `git fetch/checkout/pull` de rama `main`
2. Backup de imagen activa en `agentes-flow-ui:rollback` (si había contenedor)
3. `docker build --no-cache -t agentes-flow-ui:latest .`
4. `docker rm -f agentes-flow-ui` (si existía)
5. `docker run` nuevo con:
   - red `osmar_edge`
   - labels Traefik actuales (`agents.openclaw.elroi.cloud`)
   - variables y volúmenes actuales
6. Validación post-deploy:
   - `GET /` => `200`
   - `GET /api/health` => `200`
   - `POST /api/login` => endpoint existente (`!=404`)
7. Salida final clara:
   - `DEPLOY RESULT: PASS ✅`
   - o `[FAIL] ...`

## Rollback

Si el deploy falla o quieres volver atrás:

```bash
cd /root/.openclaw/agents-workspaces/elroi-dev/projects/agentes-flow-ui && ./rollback.sh
```

`rollback.sh` usa la imagen `agentes-flow-ui:rollback` generada por el último `deploy.sh` exitoso con contenedor previo.

## Verificación rápida manual

```bash
docker ps --filter name=agentes-flow-ui
curl -i http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/api/health
curl -i -X POST http://127.0.0.1:8080/api/login -H 'Content-Type: application/json' -d '{"password":"x"}'
```