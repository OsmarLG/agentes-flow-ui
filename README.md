# agentes-flow-ui

UX v2 de interfaz visual para monitorear la orquestación de agentes ELROI en HTML/CSS/JS vanilla.

## Fase 1 (demo funcional)

Ahora la UI consume **agentes reales** desde OpenClaw vía backend local:

- `GET /api/agents` → ejecuta `openclaw agents list --json`
- `GET /api/health` → `{ ok, timestamp, pollIntervalMs }`
- Frontend hace polling automático (default `5000ms`)
- Si cae la API, muestra badge `stale/offline` y conserva la última vista renderizada

## Incluye

- Vista principal tipo **grafo de nodos** (estilo n8n lightweight)
- Nodos por agente con estado visual (`ok`, `running`, `error`)
- Enlaces/conexiones con animación de flujo (SVG + dashed animation)
- Panel lateral de detalle al click en nodo:
  - rol
  - habilidades
  - últimas interacciones
- Navegación del canvas:
  - pan con drag (mouse/touch)
  - zoom con rueda (desktop) y pinch (touch)
  - controles visibles `+`, `-`, `Centrar`

## Estructura

```bash
.
├── app.js
├── data/
│   └── mock-data.json
├── index.html
├── package.json
├── server.js
├── scripts/
│   └── share.sh
└── styles.css
```

## Correr local (frontend + API)

1) Instalar dependencias:

```bash
npm install
```

2) Levantar servidor:

```bash
npm start
```

Abrir: <http://localhost:8080>

### Variables

- `PORT` (default: `8080`)
- `POLL_INTERVAL_MS` (default: `5000`)
- `OPENCLAW_BIN` (default: `openclaw`)

Ejemplo:

```bash
PORT=8080 POLL_INTERVAL_MS=3000 npm start
```

## Endpoints

- `GET /api/health`
- `GET /api/agents`

## Nota de data layer

Se mantiene la UI actual (grafo + panel). Solo se reemplaza la capa de datos principal por agentes reales de OpenClaw; elementos de timeline/mock quedan como apoyo visual para la demo.

## Repo

GitHub: `OsmarLG/agentes-flow-ui`
