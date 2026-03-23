---
description: "Use when creating or editing Dockerfiles, docker-compose files, or container configuration. Covers local dev setup (devDockerfile, docker-compose.local.yml) and production setup (Dockerfile, docker-compose.yml) for the backend, frontend, and PostgreSQL services."
---

# Docker Conventions

## File Layout

```
apps/
  client/
    Dockerfile              # Production multi-stage build (frontend)
    devDockerfile           # Dev build with hot-reload (frontend)
  server/
    Dockerfile              # Production multi-stage build (backend)
    devDockerfile           # Dev build with hot-reload (backend)
docker-compose.yml          # Production compose
docker-compose.local.yml    # Local development compose
.env.example                # Documented env var template (committed)
.env.local                  # Local overrides (never committed)
```

---

## Local Development — `devDockerfile` + `docker-compose.local.yml`

### Principles

- Mount source code as a volume so hot-reload works without rebuilding the image.
- Use `node:21-alpine` as the base image for both backend and frontend.
- Environment variables come from `.env.local` via `env_file` in compose.
- No build optimisations — install all deps including `devDependencies`.
- Services depend on each other with `healthcheck` to avoid race conditions.

### `apps/server/devDockerfile`

```dockerfile
FROM node:21-alpine

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN npm ci

# Source is mounted via volume at runtime — no COPY needed
WORKDIR /app/apps/server

CMD ["npm", "run", "dev"]
```

### `apps/client/devDockerfile`

```dockerfile
FROM node:21-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/client/package.json ./apps/client/

RUN npm ci

WORKDIR /app/apps/client

CMD ["npm", "run", "dev", "--", "--host"]
```

### `docker-compose.local.yml`

```yaml
name: ai-chat-local

services:
  database:
    image: postgres:17-alpine
    restart: unless-stopped
    env_file: .env.local
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data_local:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: .
      dockerfile: apps/server/devDockerfile
    restart: unless-stopped
    env_file: .env.local
    ports:
      - "3000:3000"
    volumes:
      - ./apps/server:/app/apps/server
      - ./packages/shared:/app/packages/shared
      # Prevent host node_modules from overriding container's
      - /app/node_modules
      - /app/apps/server/node_modules
    depends_on:
      database:
        condition: service_healthy

  frontend:
    build:
      context: .
      dockerfile: apps/client/devDockerfile
    restart: unless-stopped
    env_file: .env.local
    ports:
      - "5173:5173"
    volumes:
      - ./apps/client:/app/apps/client
      - ./packages/shared:/app/packages/shared
      - /app/node_modules
      - /app/apps/client/node_modules
    depends_on:
      - backend

volumes:
  postgres_data_local:
```

---

## Production — `Dockerfile` + `docker-compose.yml`

### Principles

- Multi-stage builds: `builder` stage compiles TypeScript / builds Vite bundle; `runner` stage copies only the output.
- Use `node:21-alpine` for both stages.
- Install only `--prod` dependencies in the `runner` stage.
- Never copy `.env*` files into the image — secrets are injected at runtime via the orchestrator.
- Frontend is served as static files by a separate static server (nginx) or the backend — do not run Vite in production.
- Images must run as a non-root user.

### `apps/server/Dockerfile`

```dockerfile
# ── builder ──────────────────────────────────────────────
FROM node:21-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/server

# ── runner ───────────────────────────────────────────────
FROM node:21-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma

# Run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
CMD ["node", "apps/server/dist/server.js"]
```

### `apps/client/Dockerfile`

```dockerfile
# ── builder ──────────────────────────────────────────────
FROM node:21-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/client/package.json ./apps/client/

RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/client ./apps/client

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/client

# ── runner (nginx static) ─────────────────────────────────
FROM nginx:stable-alpine AS runner

COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### `apps/client/nginx.conf`

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to backend
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SSE — disable buffering
    location /api/v1/chat/stream {
        proxy_pass http://backend:3000;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```

### `docker-compose.yml` (production)

```yaml
name: ai-chat

services:
  database:
    image: postgres:17-alpine
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10
    # Do NOT expose port 5432 to the host in production

  backend:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      JWT_SECRET: ${JWT_SECRET}
      PORT: 3000
    depends_on:
      database:
        condition: service_healthy
    # Port not exposed to host — frontend nginx proxies to it

  frontend:
    build:
      context: .
      dockerfile: apps/client/Dockerfile
    restart: always
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend

volumes:
  postgres_data:
```

---

## Rules & Constraints

- **Never** use `latest` as an image tag — always pin to a specific version (`node:21-alpine`, `postgres:17-alpine`).
- **Never** copy `.env`, `.env.local`, or any secrets file into an image.
- **Never** expose the `database` port (`5432`) to the host in production compose.
- **Always** use named volumes (not bind mounts) for database data in production.
- **Always** include a `healthcheck` on the `database` service and use `condition: service_healthy` in `depends_on`.
- **Always** build with multi-stage Dockerfiles in production to minimize image size.
- Use `node:21-alpine` (not `node:21` or `node:21-slim`) for consistency across all Node services.
- The `runner` stage must run as a non-root user — use `adduser`/`addgroup` or the `USER` directive.
- SSE streaming endpoints require `proxy_buffering off` in nginx — always add this for `/api/v1/chat/stream` or equivalent.
