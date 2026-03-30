# AI Chat

Fullstack AI chat application with streaming responses, file attachments (PDF), tool integrations (n8n, Zapier MCP), and conversation history.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, TypeScript |
| Backend | Express, WebSocket (ws), OpenAI SDK, TypeScript |
| Database | PostgreSQL 17, Prisma ORM |
| Infrastructure | Docker, Docker Compose, nginx |

## Monorepo Structure

```
apps/
  client/       # React + Vite frontend (port 5173)
  server/       # Express + WebSocket backend (port 3000)
packages/
  shared/       # Shared types, Zod schemas, utilities (@ai-chat/shared)
```

## Prerequisites

- Docker & Docker Compose
- OpenAI API key

## Quick Start (Local Development)

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd ai-chat
   ```

2. **Create environment file**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and set required values:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `POSTGRES_USER` | Yes | PostgreSQL user |
   | `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
   | `POSTGRES_DB` | Yes | Database name |
   | `DATABASE_URL` | Yes | PostgreSQL connection string |
   | `JWT_SECRET` | Yes | Auth secret (min 32 chars) |
   | `OPENAI_API_KEY` | Yes | OpenAI API key |
   | `PORT` | Yes | Backend port (default `3000`) |
   | `CORS_ORIGINS` | Yes | Allowed origins (default `http://localhost:5173`) |
   | `VITE_API_URL` | Yes | Backend URL for the client |
   | `VITE_WS_URL` | Yes | WebSocket URL for the client |
   | `N8N_MCP_URL` | No | n8n MCP webhook URL |
   | `N8N_MCP_API_KEY` | No | n8n MCP API key |
   | `ZAPIER_MCP_URL` | No | Zapier MCP URL |
   | `ZAPIER_MCP_API_KEY` | No | Zapier MCP API key |

3. **Start all services**

   ```bash
   docker compose -f docker-compose.local.yml up --build
   ```

   This starts:
   - **PostgreSQL** on `localhost:5432`
   - **Backend** on `localhost:3000` (with hot-reload)
   - **Frontend** on `localhost:5173` (with HMR)
   - **n8n** on `localhost:5678` (workflow automation)

   On first start the backend container automatically runs `npm ci`, generates the Prisma client, builds the shared package, and applies migrations.

4. **Open the app**

   Navigate to [http://localhost:5173](http://localhost:5173)

## Production

```bash
# Create .env with production values
cp .env.example .env

docker compose up --build -d
```

The production setup serves the frontend via nginx on port 80/443 and proxies API requests to the backend internally.

## Useful Commands

All npm commands should be run inside Docker containers:

```bash
# Open a shell in the backend container
docker compose -f docker-compose.local.yml exec backend sh

# Run Prisma migrations
npm exec --workspace=server -- prisma migrate dev

# Generate Prisma client
npm exec --workspace=server -- prisma generate

# Seed the database
npm exec --workspace=server -- prisma db seed

# Open Prisma Studio
npm exec --workspace=server -- prisma studio

# Lint
npm run lint

# Format
npm run format

# Type check
npm run typecheck
```

## Project Conventions

- Shared types and Zod schemas live in `packages/shared` — import via `@ai-chat/shared`
- TypeScript strict mode is enabled everywhere
- Zod schemas are defined in `packages/shared/src/schemas/` with types derived via `z.infer<>`
- API errors conform to the `ApiError` type from `packages/shared`
- Environment variables are validated with Zod at startup
