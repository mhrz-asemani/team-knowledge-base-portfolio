# Team Knowledge Base

Team Knowledge Base is a collaborative web application for organizing a team's shared knowledge in workspaces. Members can create and manage Markdown documents, search and sort them, and collaborate under workspace roles. Owners manage membership; Members can work with documents; Viewers have read-only access. Documents are scoped to a workspace and access is enforced by the API.

## Technology stack

| Area | Technology | Role |
|---|---|---|
| Frontend | React, TypeScript, Vite | Persian, right-to-left single-page application |
| Web server | Nginx | Serves the production frontend container |
| Backend | NestJS, TypeScript | Versioned REST API under `/api/v1` |
| Database | PostgreSQL | Persistent users, sessions, workspaces, memberships, and documents |
| Data access | `pg` with parameterized SQL | Explicit, safe SQL queries without an ORM |
| Schema changes | `node-pg-migrate` | Versioned database migrations |
| Monorepo | pnpm Workspaces | Shared dependency management for frontend and API |
| Optional AI | Groq API | Streams structured summaries for workspace documents |

## Application architecture

The frontend is a React single-page application. It owns the user interface, local form state, and API client, and communicates with the backend over HTTP. It never connects directly to PostgreSQL or stores server secrets in the browser.

The backend is a modular monolith: one NestJS API application organized into authentication, users, workspaces, memberships, documents, database, and health modules. A request is handled by a controller, validated and authorized, then processed by a service and parameterized database query.

This architecture keeps the product straightforward to develop and deploy while preserving clear domain boundaries. A single API and database avoid the operational cost of microservices at this scale. The REST/OpenAPI contract also allows clients beyond the web application to use the backend.

## Core capabilities

- Account registration, sign-in, sign-out, and persistent server-side sessions.
- Workspace creation and selection.
- Owner-managed membership and workspace roles.
- Markdown document creation, reading, editing, and deletion.
- Workspace-scoped document search, sorting, and pagination.
- Optional streamed AI summaries with key points and action items.
- API health and readiness endpoints, plus Swagger/OpenAPI documentation.

Authentication uses opaque server-side sessions delivered in HttpOnly cookies. Passwords are hashed with Argon2id. The API applies workspace-level authorization and validates request input; the frontend also reflects role-based capabilities for a clear user experience.

## Local Docker setup

Requirements: Git, Docker Desktop or Docker Engine, and Docker Compose v2. From a terminal:

```bash
git clone https://github.com/mhrz-asemani/team-knowledge-base-portfolio.git
cd team-knowledge-base-portfolio
cp .env.example .env
docker compose up --build
```

Compose starts PostgreSQL, waits for its health check, runs database migrations, then starts the API and frontend. Open the application at [http://localhost:8080](http://localhost:8080).

Other local endpoints:

- API liveness: [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)
- API readiness: [http://localhost:3000/api/v1/health/ready](http://localhost:3000/api/v1/health/ready)
- Swagger UI: [http://localhost:3000/api/v1/docs](http://localhost:3000/api/v1/docs)

The AI summary feature remains unavailable until a Groq API key is configured in the local `.env` file. The database persists in a Docker volume across normal restarts. Use `docker compose down` to stop the stack; adding `-v` also removes the local database volume and its data.
