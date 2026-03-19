# agentes-flow-ui

MVP de interfaz visual para monitorear la orquestación de agentes ELROI.

## Incluye

- Dashboard con tarjetas de agentes (`main`, `content`, `ops`, `dev`, `office`, `agent-factory`) con:
  - nombre
  - rol
  - habilidades clave
  - tools clave
  - estado
- Vista de flujo (timeline) de delegación:
  - mensaje entrante del usuario
  - decisión de ELROI
  - tareas delegadas por agente
  - resultados y consolidación final
- Panel de actividad:
  - última interacción por agente
  - timestamp relativo
  - estado (`running`, `success`, `error`)
- Datos mock en JSON local para demo funcional (`data/mock-data.json`)

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

Script incluido:

```bash
chmod +x scripts/share.sh
./scripts/share.sh 8080
```

El script levanta el servidor local. Para exposición pública temporal, usar un túnel como `ngrok`:

```bash
ngrok http 8080
```

## Repo

GitHub: `OsmarLG/agentes-flow-ui`
