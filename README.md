# agentes-flow-ui

UX v2 de interfaz visual para monitorear la orquestación de agentes ELROI en HTML/CSS/JS vanilla.

## Características principales

### 1) Datos reales en tiempo real
- **Conexión directa a API de OpenClaw**: Los datos mostrados son 100% reales, obtenidos directamente de OpenClaw
- **Endpoints reales**: 
  - `/api/v1/agents` (agentes activos) via `openclaw agents list --json`
  - `/api/v1/sessions` (actividad reciente) via lectura de sesiones OpenClaw
- **Polling automático**: Actualización automática cada 30 segundos
- **Sin datos mock**: Eliminada completamente la dependencia de `mock-data.json`

### 2) CI/CD Automático
- **GitHub Actions workflow**: Despliegue automático en push a `main`
- **Pipeline completo**: Build → Push Docker image → Deploy en producción
- **Zero-downtime deployment**: Contenedor actualizado sin interrupción del servicio
- **Sin intervención manual**: Push y olvida - el sistema se actualiza solo

### 3) Protección por contraseña

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
POLL_INTERVAL_MS=30000  # Polling cada 30 segundos
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

## CI/CD Automático

El repositorio incluye un workflow de GitHub Actions que se ejecuta automáticamente en cada push a la rama `main`:

1. **Build Docker image**: Construye la imagen con Node.js 20 Alpine
2. **Push to Docker Hub**: Sube la imagen etiquetada como `latest` y con el hash del commit
3. **Deploy to production**: Se conecta al servidor de producción vía SSH y:
   - Descarga la última imagen
   - Detiene y elimina el contenedor anterior
   - Ejecuta el nuevo contenedor con montaje de volumen para acceso a OpenClaw
   - Limpia imágenes antiguas

### Configuración de secrets en GitHub

Para que el workflow funcione, configurar los siguientes secrets en el repositorio:

- `DOCKER_USERNAME`: Usuario de Docker Hub
- `DOCKER_TOKEN`: Token de acceso a Docker Hub
- `SSH_HOST`: Host del servidor de producción
- `SSH_USERNAME`: Usuario SSH
- `SSH_PRIVATE_KEY`: Clave privada SSH
- `SSH_PORT`: Puerto SSH (opcional, default 22)

## Docker

```bash
# Build local
docker build -t agentes-flow-ui .

# Run local
docker run -p 8080:8080 -v /root/.openclaw:/root/.openclaw:ro agentes-flow-ui
```

## Repo

GitHub: `OsmarLG/agentes-flow-ui`
