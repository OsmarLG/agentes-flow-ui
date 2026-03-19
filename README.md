# agentes-flow-ui

UX v2 de interfaz visual para monitorear la orquestación de agentes ELROI en HTML/CSS/JS vanilla.

## Novedades

### 1) Actividad real visible

Nuevo endpoint backend:

- `GET /api/activity`

Entrega:

- actividad general reciente del sistema
- actividad reciente por agente (últimas N)
- `sourceSummary` para indicar origen de datos (`real`, `mixed`, `fallback`)

Estrategia actual de datos:

- **Real**: lectura de sesiones recientes en `~/.openclaw/agents/*/sessions/sessions.json` + eventos de `~/.openclaw/logs/config-audit.jsonl`.
- **Fallback explícito**: cuando faltan eventos reales suficientes, completa con mock y marca cada item como `source: "fallback"`.

En frontend se muestran:

- panel de actividad general
- panel de actividad por agente
- badge de origen (`REAL`, `MIXED`, `FALLBACK`)
- polling junto con la carga de agentes

### 2) Protección por contraseña

Se agregó acceso con contraseña **antes** del dashboard.

- `POST /api/login` recibe `{ password }` y devuelve token temporal en memoria
- `POST /api/logout` invalida token
- `GET /api/session` valida token actual
- rutas de datos (`/api/agents`, `/api/activity`) requieren autenticación
- frontend **no** contiene contraseña hardcodeada

> Nota: el token se guarda en `localStorage` para demo local.

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

## Configuración local

1) Instalar dependencias:

```bash
npm install
```

2) Crear `.env.local` (no se versiona):

```bash
cp .env.example .env.local
```

3) Editar `.env.local` y definir:

```bash
DASH_PASSWORD=tu_password_seguro
PORT=8080
POLL_INTERVAL_MS=5000
OPENCLAW_BIN=openclaw
# OPENCLAW_HOME=/root/.openclaw
```

4) Levantar servidor:

```bash
npm start
```

Abrir: <http://localhost:8080>

## Endpoints

Públicos:

- `GET /api/health`
- `POST /api/login`

Protegidos (Bearer token):

- `GET /api/session`
- `POST /api/logout`
- `GET /api/agents`
- `GET /api/activity?limitPerAgent=5`

## Repo

GitHub: `OsmarLG/agentes-flow-ui`
