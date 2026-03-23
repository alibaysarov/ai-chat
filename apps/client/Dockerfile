# ── builder ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
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
