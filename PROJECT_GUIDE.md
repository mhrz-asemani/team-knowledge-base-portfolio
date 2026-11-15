# Team Knowledge Base

Team Knowledge Base is a collaborative knowledge-management application for teams. Users work inside isolated workspaces, manage Markdown documents, and collaborate through workspace roles. The interface is Persian and fully right-to-left (RTL).

- **Live application:** https://team-knowledge-base-web.onrender.com/
- **API documentation:** https://team-knowledge-base-api-e0g1.onrender.com/api/v1/docs
- **Repository:** https://github.com/mhrz-asemani/team-knowledge-base-portfolio

## Technology stack

### Frontend
- **React 19** — component-based user interface.
- **TypeScript 6** — static typing for application code.
- **Vite 8** — development server and production bundling.
- **Vitest 5** — frontend automated tests.
- **Nginx** — serves the compiled static frontend in the Docker Compose deployment.

### Backend
- **Node.js 22** — server-side JavaScript runtime.
- **NestJS 12 + TypeScript 6** — REST API implementation.
- **Express** — HTTP platform used by NestJS.
- **PostgreSQL 18** — relational database for users, sessions, workspaces, memberships, and documents.
- **node-postgres (pg)** — database connectivity and parameterized SQL queries; no ORM is used.
- **node-pg-migrate** — version-controlled database schema migrations.
- **class-validator + class-transformer** — request DTO validation and transformation.
- **Argon2id** — password hashing.
- **@nestjs/throttler** — API rate limiting.
- **Groq SDK** — optional LLM integration for document summaries.
- **Vitest 5** — backend automated tests.

### Shared tooling and quality
- **pnpm 12 Workspaces** — monorepo package and dependency management.
- **TypeScript** — shared language and type-checking across frontend and backend.
- **OpenAPI / Swagger** — documented, versioned REST API contract.
- **Node.js test runner** — browser-flow end-to-end test script.

## Application architecture

### Repository and application boundaries
The repository is a **pnpm Workspaces monorepo** with two independently built applications:
- `apps/web` — React SPA responsible for presentation, client-side interaction, and communication with the API.
- `apps/api` — NestJS REST API responsible for authentication, authorization, business rules, persistence, and AI-provider integration.

The browser communicates with the backend over HTTP. It does not connect directly to PostgreSQL and does not receive server-side credentials such as the Groq API key.

### Backend: modular monolith
The backend follows a **modular monolith** architecture rather than a microservices architecture:
- Domain modules separate authentication, users, workspaces, memberships, documents, database access, and health checks.
- Controllers expose HTTP endpoints and the API contract.
- DTO validation and authorization are applied at the API boundary.
- Services implement application and business logic.
- Database access uses parameterized SQL through `pg`.
- PostgreSQL stores application data; `node-pg-migrate` manages schema evolution.

This keeps deployment and operations relatively simple while retaining domain boundaries inside one API application.

### Authentication and access control
- Opaque server-side sessions are delivered to the browser through **HttpOnly cookies**.
- Passwords are hashed with **Argon2id**.
- Workspace roles include **Owner**, **Member**, and **Viewer**.
- Workspace and document access is enforced by the API; frontend role-aware controls are not treated as the security boundary.

### AI document summaries
- The API integrates with **Groq** through its server-side SDK.
- Summary generation is streamed to the client using **Server-Sent Events (SSE)**.
- The generated result is validated against the expected structured output before being treated as final.
- Provider credentials remain on the server and are configured as environment secrets.
- The feature is optional and requires a Groq API key.

## DevOps, containers, and CI/CD

### Docker and Docker Compose
The project provides a containerized local stack:
- **PostgreSQL container** with a persistent named volume and health check.
- **Migration service** that waits for database readiness and applies migrations before the API starts.
- **API container** built from a multi-stage Node.js Dockerfile, with a readiness health check.
- **Frontend container** built in multiple stages and served by Nginx.
- Compose dependency conditions coordinate database readiness, migration completion, and API health before dependent services start.

Start the complete stack locally:

```bash
cp .env.example .env
docker compose up --build
```

Local endpoints:
- Web application: http://localhost:8080
- API: http://localhost:3000/api/v1
- Liveness: http://localhost:3000/api/v1/health
- Readiness: http://localhost:3000/api/v1/health/ready
- Swagger UI: http://localhost:3000/api/v1/docs
- OpenAPI JSON: http://localhost:3000/api/v1/openapi.json

PostgreSQL data is stored in a named Docker volume and survives normal container restarts. Removing volumes with `docker compose down -v` deletes that local database data.

### GitHub Actions
The GitHub Actions CI workflow runs for pushes and pull requests targeting `main`. It:
- Starts an isolated PostgreSQL 18 service for CI.
- Installs dependencies from the committed pnpm lockfile.
- Applies database migrations.
- Runs TypeScript type checks and automated tests.
- Builds the frontend and backend.
- Validates the Docker Compose configuration.
- Builds the API and frontend Docker images.

### Hosting and deployment
The portfolio deployment is hosted on **Render**:
- **Frontend:** Render Static Site, built from the React/Vite application and published from `apps/web/dist`.
- **Backend:** Render Web Service using the API Dockerfile.
- **Database:** Render-managed PostgreSQL, connected to the API through the database connection string.
- **Region:** Frankfurt, as configured for the API service.
- **Health monitoring:** the API service uses `/api/v1/health/ready` as its readiness health-check endpoint.
- **Frontend-to-API configuration:** the API base URL is supplied through the frontend build environment; the API's allowed web origin is configured server-side.

Production secrets, including the Groq API key, are configured as service environment variables and are not committed to the repository.

## Main product capabilities
- Account registration, sign-in, sign-out, and persistent sessions.
- Workspace creation and selection.
- Workspace membership management and role-based access control.
- Markdown document creation, reading, editing, and deletion.
- Workspace-scoped document search, sorting, and pagination.
- Optional AI-generated document summaries streamed through SSE.
- API health/readiness endpoints and Swagger/OpenAPI documentation.

## Scope and limitations
The current portfolio version includes collaborative workspaces, document management, role-based authorization, and initial LLM-powered summarization. **Embeddings, semantic search, and retrieval-augmented generation (RAG) are not implemented** in this version.