# Feature: Project Setup

## Контекст
Начальная настройка монорепо, Docker-окружения, базовых компонентов UI и серверного каркаса.

## Требования
- [x] Монорепо с npm workspaces: `apps/client`, `apps/server`, `packages/shared`
- [x] TypeScript strict mode во всех пакетах
- [x] Docker Compose для локальной разработки (PostgreSQL, backend, frontend)
- [x] Prisma ORM подключён к PostgreSQL
- [x] Базовый Express-сервер с helmet, cors, rate-limit
- [x] WebSocket-сервер на том же HTTP-порте
- [x] Vite + React клиент с CSS Modules и темизацией
- [x] Страница чата с sidebar, списком сообщений и composer
- [x] Валидация env через Zod на клиенте и сервере
- [x] `.env.local` / `.env.example` для всех сервисов

## Затронутые части
- Все пакеты и сервисы

## API-контракт
n/a — инфраструктурная задача
