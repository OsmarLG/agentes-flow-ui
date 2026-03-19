# agentes-flow-ui

UX v2 de interfaz visual para monitorear la orquestación de agentes ELROI en HTML/CSS/JS vanilla.

## Incluye

- Vista principal tipo **grafo de nodos** (estilo n8n lightweight)
- Nodos por agente (`main`, `content`, `ops`, `dev`, `office`, `agent-factory`) con:
  - estado visual (`ok`, `running`, `error`)
  - badges de tools
- Enlaces/conexiones con animación de flujo (SVG + dashed animation)
- Flujo macro en 4 etapas:
  - Entrada
  - Orquestación
  - Delegación
  - Resultado
- Panel lateral de detalle al click en nodo:
  - rol
  - habilidades
  - últimas interacciones
- Ajuste de mock para `agent-factory` sin error por defecto (solo error ante evento real)

## Estructura

```bash
.
├── app.js
├── data/
│   └── mock-data.json
├── index.html
├── scripts/
│   └── share.sh
└── styles.css
```

## Correr local

Opción 1 (Python):

```bash
python3 -m http.server 8080
```

Opción 2 (Node):

```bash
npx --yes http-server . -p 8080 -c-1
```

Abrir: <http://localhost:8080>

## Share temporal

```bash
chmod +x scripts/share.sh
./scripts/share.sh 8080
```

En otra terminal (si tienes ngrok):

```bash
ngrok http 8080
```

## Repo

GitHub: `OsmarLG/agentes-flow-ui`
