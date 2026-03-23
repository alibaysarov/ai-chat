---
description: "Scaffold a new REST API endpoint in apps/server: router, validation middleware, service function, and shared Zod schema. Provide the HTTP method, resource name, and optionally a request/response shape."
argument-hint: "e.g. POST /conversations — create a new conversation"
agent: "agent"
tools: [search, editFiles, problems]
model: Claude Opus 4.6 (copilot)
---

Follow the [backend instructions](../instructions/backend.instructions.md) and [AI integration instructions](../instructions/ai-integration.instructions.md) throughout.

## Task

Scaffold a complete, production-ready endpoint for the following:

**$input** <!-- e.g. "POST /api/v1/conversations — create a new conversation with an initial message" -->

---

## Steps to complete

### 1. Shared Zod schema (`packages/shared/src/schemas/`)

- Create or update the relevant schema file (e.g. `conversation.ts`).
- Define `<resource>RequestSchema` and `<resource>ResponseSchema` using Zod.
- Derive and export TypeScript types with `z.infer<>`.
- Re-export from `packages/shared/src/schemas/index.ts`.

### 2. Express router (`apps/server/src/routers/<resource>-router.ts`)

- Register the route using the `validate` middleware with the request schema.
- Call the service function and handle `Result<T, E>` — return `AppError` on failure, JSON on success.
- Wrap the handler with `asyncHandler`.
- Register the router in `apps/server/src/app.ts` under `/api/v1/<resource>`.

### 3. Service function (`apps/server/src/services/<resource>-service.ts`)

- Accept plain typed data — no Express `Request`/`Response` types.
- Return `Result<ResponseType, AppError>`.
- Include any database or AI client calls as needed.

### 4. Verify

- Run `get_errors` on all modified files and fix any TypeScript errors.
- Confirm the barrel exports in `packages/shared/src/index.ts` are updated if new types were added.

---

## Constraints

- All types shared between client and server must live in `packages/shared` and be imported via `@ai-chat/shared`.
- Never use `any`. Use `unknown` + type guards or generics.
- Never access `process.env` directly — use `env` from `apps/server/src/env.ts`.
- Do not expose internal error details to the client.
