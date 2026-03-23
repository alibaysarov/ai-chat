# AI Chat App — Workspace Instructions

This is a **fullstack monorepo** for an AI chat application built with React, Express, and TypeScript.

## Monorepo Structure

```
apps/
  client/       # React + Vite frontend
  server/       # Express backend
packages/
  shared/       # Shared TypeScript types, utils, schemas
```

- **Always** define shared types (API request/response shapes, domain models) in `packages/shared` and import from there in both `apps/client` and `apps/server`.
- **Never** duplicate types between client and server — they must share from `packages/shared`.
- Import from the shared package using the workspace alias `@ai-chat/shared`.

## TypeScript

- `strict: true` is required in all `tsconfig.json` files. Never disable strict mode.
- Prefer explicit return types on exported functions.
- Use `type` for data shapes, `interface` for extendable contracts (e.g., request/response).
- Never use `any`. Use `unknown` + type guards or generics instead.
- Use `satisfies` operator to validate object literals against types without widening.

## Shared Conventions

- **Zod** is the schema validation library. Define Zod schemas in `packages/shared/src/schemas/` and derive TypeScript types from them with `z.infer<>`.
- All environment variables must be validated with Zod at startup in both `apps/client` (via Vite's `import.meta.env`) and `apps/server`. Fail fast if required vars are missing.
- Use `npm` workspaces. Do not use `pnpm` or `yarn`.
- ESLint + Prettier are enforced. No custom overrides without justification.
- All new modules must export from an `index.ts` barrel file.

## Naming Conventions

| Artifact | Convention | Example |
|----------|-----------|---------|
| React components | PascalCase file + named export | `ChatWindow.tsx` |
| Hooks | `use` prefix, camelCase | `useChatStream.ts` |
| Express routers | kebab-case | `chat-router.ts` |
| Shared types | PascalCase, suffix with domain | `ChatMessage`, `ApiError` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_TOKENS` |
| Zod schemas | camelCase + `Schema` suffix | `chatMessageSchema` |

## Error Handling

- Use a discriminated union `Result<T, E>` pattern for business logic errors; reserve thrown errors for truly exceptional/unrecoverable cases.
- All API errors must conform to `ApiError` from `packages/shared/src/types/errors.ts`.
- Never expose internal error details (stack traces, DB errors) to the client.


## Enviroment variables
- Duplicate variables to .env.example
- Use envs for secrets and necessary values