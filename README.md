# Team Knowledge Base

A full-stack collaborative knowledge-base application. This repository is a **pnpm workspaces monorepo** containing the React web client and NestJS API in separate applications.

- **Live demo:** https://team-knowledge-base-web.onrender.com/
- **API documentation:** https://team-knowledge-base-api-e0g1.onrender.com/api/v1/docs

## Features
- Account registration, login, logout, and PostgreSQL-backed sessions
- Workspace creation and membership management with role-based access control
- Markdown document creation, editing, search, sorting, and pagination
- Persian right-to-left interface
- AI-assisted document summaries streamed with Server-Sent Events
- Request validation, centralized API errors, and database migrations

## Monorepo structure
```text
.
├── apps/
│   ├── api/       # NestJS + TypeScript REST API
│   └── web/       # React + TypeScript + Vite client
├── docs/          # Technical documentation
├── e2e/           # Browser-flow tests
├── scripts/       # Local smoke-test utilities
├── compose.yaml
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

The backend is a modular monolith. PostgreSQL is accessed through parameterized SQL using `pg`; schema changes are managed with `node-pg-migrate`. The API exposes an OpenAPI contract and Swagger UI.

## Technology
React, TypeScript, Vite, NestJS, Node.js, PostgreSQL, pnpm Workspaces, Docker Compose, Vitest, GitHub Actions, and Groq (optional AI summaries).

## Run locally
Requirements: Node.js 22.22.3+, pnpm 12.15.0, and Docker with Compose v2.

```bash
corepack enable
corepack prepare pnpm@12.15.0 --activate
pnpm install --frozen-lockfile
```

Create the local environment file in PowerShell:
```powershell
Copy-Item .env.example .env
```

Start the stack:
```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:8080 |
| API | http://localhost:3000/api/v1 |
| Swagger UI | http://localhost:3000/api/v1/docs |
| OpenAPI JSON | http://localhost:3000/api/v1/openapi.json |

Sample environment values are for local development only. Replace them before exposing services beyond your machine. To enable AI summaries locally, set `GROQ_API_KEY` in the ignored `.env` file. The key is consumed server-side and is never exposed to the browser.

## Quality checks
Run from the repository root:
```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

GitHub Actions provisions an isolated PostgreSQL service, applies migrations, runs type checks and tests, builds both applications, validates Compose configuration, and builds the Docker images.

## Security
- Never commit `.env` files or real API credentials.
- AI provider credentials must remain server-side.
- Authentication uses HttpOnly session cookies.
- Workspace authorization is enforced by the API, not only by frontend controls.

## Scope
The current application includes workspace collaboration, document CRUD, role-based access, and initial LLM-powered summarization. Embeddings, semantic search, and retrieval-augmented generation (RAG) are not implemented in this version.
