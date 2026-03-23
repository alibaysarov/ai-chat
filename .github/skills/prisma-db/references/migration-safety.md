# Migration Safety Checklist

Review every generated `migration.sql` file against this checklist before committing or applying.

---

## 1. Destructive Operations — Require Explicit Approval

| SQL pattern | Risk | Required action |
|-------------|------|-----------------|
| `DROP TABLE` | Permanent data loss | Confirm data is no longer needed; backup first |
| `DROP COLUMN` | Permanent data loss | Must be separated from code that still reads the column |
| `TRUNCATE` | Permanent data loss | Should never appear in a migration |
| `ALTER TABLE ... RENAME COLUMN` | Breaks running queries | Deploy code that handles both names first |
| `ALTER TABLE ... RENAME TO` | Breaks all references | Full deploy coordination required |

**Rule**: Never combine a destructive operation with additive operations in the same migration. Split into two migrations.
**Rule**: Before creating new table or altering existing one add check for existence IF NOT EXISTS IF EXISTS
---

## 2. Data-Type Changes

- Widening (e.g. `INT` → `BIGINT`) is safe.
- Narrowing (e.g. `TEXT` → `VARCHAR(50)`) can truncate existing data — verify all values fit.
- Changing from nullable to `NOT NULL` requires a default or a data backfill step **before** the constraint is added:
  ```sql
  -- Step 1 (migration N): add column as nullable
  ALTER TABLE "Message" ADD COLUMN "status" TEXT;

  -- Step 2 (migration N+1): backfill, then add NOT NULL
  UPDATE "Message" SET "status" = 'sent' WHERE "status" IS NULL;
  ALTER TABLE "Message" ALTER COLUMN "status" SET NOT NULL;
  ```

---

## 3. Index Creation on Large Tables

- `CREATE INDEX` without `CONCURRENTLY` locks the table.
- For tables that are already in use, prefer:
  ```sql
  CREATE INDEX CONCURRENTLY "idx_message_conversation_id" ON "Message"("conversationId");
  ```
- Note: Prisma does not generate `CONCURRENTLY` — edit the migration SQL manually for large tables.

---

## 4. Foreign Key Constraints

- Verify that referenced rows exist before adding an FK constraint, or add it as `DEFERRABLE`.
- `ON DELETE CASCADE` is powerful — confirm that cascading deletes are the intended behavior.
- `ON DELETE SET NULL` requires the FK column to be nullable.

---

## 5. Rollback Plan

Every migration that touches existing data should have a documented rollback:

```
-- Rollback: DROP COLUMN "status" FROM "Message";
```

Add this as a comment at the top of the migration SQL file.

---

## 6. Never in Migrations

- `INSERT`/`UPDATE`/`DELETE` of large datasets — do this in a separate data script, not a migration.
- Application-level secrets or environment values.
- `prisma migrate reset` in production — this drops and recreates the entire database.
