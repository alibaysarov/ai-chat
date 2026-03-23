# Prisma Schema Patterns

Reference templates for common model patterns in this project.

---

## Datasource & Generator

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

---

## Naming Conventions

| Prisma | PostgreSQL (via `@map` / `@@map`) |
|--------|-----------------------------------|
| `model User` | `@@map("users")` |
| `conversationId String` | `@map("conversation_id")` |
| `createdAt DateTime` | `@map("created_at")` |
| `id String @id` | `@map("id")` |

Always map model names to **plural snake_case** table names and field names to **snake_case** column names.

---

## Base Fields (include on every model)

```prisma
model Example {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("examples")
}
```

- Use `cuid()` for IDs (URL-safe, sortable). Use `uuid()` only if external systems require it.
- Always include `createdAt` and `updatedAt`.

---

## One-to-Many Relation

```prisma
model Conversation {
  id        String    @id @default(cuid())
  userId    String    @map("user_id")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages Message[]

  @@index([userId])
  @@map("conversations")
}

model Message {
  id             String   @id @default(cuid())
  conversationId String   @map("conversation_id")
  role           MessageRole
  content        String
  createdAt      DateTime @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@map("messages")
}
```

- Always add `@@index` on FK columns used in `WHERE` or `ORDER BY`.
- Prefer `onDelete: Cascade` for child records that cannot exist without their parent.

---

## Enum

```prisma
enum MessageRole {
  system
  user
  assistant

  @@map("message_role")
}
```

- Enum values: lowercase to match the LLM API convention.
- Mirror these values in the shared Zod schema:
  ```ts
  // packages/shared/src/schemas/chat.ts
  export const messageRoleSchema = z.enum(['system', 'user', 'assistant']);
  export type MessageRole = z.infer<typeof messageRoleSchema>;
  ```

---

## Soft Delete Pattern

Avoid hard deletes for messages/conversations — use a `deletedAt` flag:

```prisma
model Conversation {
  ...
  deletedAt DateTime? @map("deleted_at")
}
```

Filter soft-deleted records at the service layer with a default `where: { deletedAt: null }` scope.

---

## Indexes

```prisma
// Single column
@@index([userId])

// Composite
@@index([conversationId, createdAt])

// Unique constraint
@@unique([userId, externalId])
```

- Add composite indexes when queries filter by multiple columns together.
- Unique constraints create an implicit index — don't add a redundant `@@index`.

---

## What NOT to Put in schema.prisma

- Application secrets or hardcoded values.
- Business logic — that lives in the service layer.
- Direct imports from `@ai-chat/shared` — schema.prisma is Prisma DSL only.
