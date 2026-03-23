---
name: prisma-db
description: 'Workflow skill for PostgreSQL + Prisma ORM tasks: adding models, writing migrations, seeding data, running schema changes safely, fixing drift, and reviewing migration history. Use when: adding a Prisma model, writing a migration, seeding the database, resolving migration conflicts, reviewing schema, or integrating Prisma with Express services.'
argument-hint: "e.g. add a Conversation model with messages relation"
---

# Prisma + PostgreSQL Workflow

## When to Use

- Adding or modifying a Prisma model or relation
- Creating a migration (schema change, add column, rename, drop)
- Seeding or re-seeding the database
- Resolving migration drift or failed migrations
- Integrating a new model into an Express service
- Reviewing migration history or schema state

---

## Procedures

### A. Add or Modify a Model

1. **Edit `schema.prisma`** in `apps/server/prisma/schema.prisma`.
   - Follow the [schema patterns reference](./references/schema-patterns.md).
   - Add the model, fields, relations, and indexes needed.
   - Use `@map` / `@@map` to keep DB column names snake_case while Prisma model fields stay camelCase.

2. **Create the migration**
   ```bash
   pnpm --filter server exec prisma migrate dev --name <descriptive-name>
   ```
   - Use imperative, descriptive names: `add-conversation-model`, `add-user-email-index`.
   - Never use generic names like `migration1` or `update`.

3. **Review the generated SQL** in `apps/server/prisma/migrations/<timestamp>_<name>/migration.sql` before committing.
   - Follow the [migration safety checklist](./references/migration-safety.md).
   - Verify no destructive operations are unintended.

4. **Update shared types** in `packages/shared/src/types/` to reflect the new domain model.
   - Derive the TypeScript type from the Zod schema, not from the Prisma generated type directly (Prisma types stay server-side only).

5. **Update the service layer** (`apps/server/src/services/`) to use the new model via the Prisma client.

---

### B. Seed the Database

1. Edit or create `apps/server/prisma/seed.ts`.
2. Use `upsert` with deterministic `where` clauses so seeding is idempotent.
3. Run:
   ```bash
   pnpm --filter server exec prisma db seed
   ```
4. Verify `package.json` in `apps/server` has:
   ```json
   "prisma": { "seed": "tsx prisma/seed.ts" }
   ```

---

### C. Resolve Migration Drift

1. Check current state:
   ```bash
   pnpm --filter server exec prisma migrate status
   ```
2. If migrations were applied manually to the DB but not recorded, use:
   ```bash
   pnpm --filter server exec prisma migrate resolve --applied <migration-name>
   ```
3. If the DB schema diverged from Prisma schema without a migration, create a baseline migration:
   ```bash
   pnpm --filter server exec prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/<timestamp>_baseline/migration.sql
   ```
4. Never run `prisma migrate reset` in production or against shared databases — confirm with the user first.

---

### D. Integrate Model into Express Service

1. Import the singleton Prisma client — never instantiate `new PrismaClient()` inline:
   ```ts
   // apps/server/src/lib/db.ts (singleton)
   import { PrismaClient } from '@prisma/client';
   export const db = new PrismaClient();
   ```
2. Use the client in services only — never in routers or middleware.
3. Wrap Prisma calls with `Result<T, AppError>` — catch `PrismaClientKnownRequestError` and map to typed errors.
4. Use `select` or `include` explicitly — never return the full Prisma object to avoid leaking fields (e.g., `passwordHash`).

---

## References

- [Schema patterns](./references/schema-patterns.md) — model templates, relations, indexes, enums
- [Migration safety checklist](./references/migration-safety.md) — review criteria before committing migrations
