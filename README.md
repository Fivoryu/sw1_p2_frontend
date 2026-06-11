# SW1 P2 — Frontend

Aplicación Angular 19 para administración, políticas UML, workflow y panel de control.

## Requisitos

- Node.js 20+ (recomendado; el proyecto compila también con Node 24 en este entorno)
- Backend FastAPI en `http://localhost:8000`

## Configuración

```bash
cd frontend
npm install
```

Las URLs de API y WebSocket están en `src/environments/`.

## Ejecutar

```bash
npm start
```

Abre `http://localhost:4200/`.

## Build

```bash
npm run build
```

## Docker

Desde la raíz del monorepo:

```bash
docker compose up frontend
```
