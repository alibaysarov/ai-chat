---
agent: agent
model: Claude Sonnet 4.6 (copilot)
description: "Template prompt for generating a new feature spec. Output is saved to .github/specs/active/."

---

You are a senior software architect. Your task is to generate a detailed implementation specification for the feature described below.

**Output rules:**
- Save the spec as a new file in `.github/specs/active/<feature-slug>.prompt.md`
- Use kebab-case for the filename derived from the feature name
- The output file must start with this exact frontmatter:
  ```
  ---
  agent: agent
  model: Claude Sonnet 4.5 (copilot)
  description: "<one-line description of the feature>"
  ---
  ```

**Spec must include the following sections:**

1. **Overview** — what the feature does and why
2. **Architecture / Flow** — ASCII diagram of the request/response flow across client ↔ server ↔ DB ↔ external services
3. **New file structure** — full list of files to create or modify with comments (← NEW / ← UPDATED)
4. **Step-by-step specification** — numbered sections, one per layer:
   - Shared types and Zod schemas (`packages/shared`)
   - Prisma model changes + migration command (if DB is involved)
   - Repository interface + implementation
   - Service interface + implementation (no DB calls in service)
   - Router / HTTP or WS handler
   - Any new lib wrappers
5. **Security considerations** — explicit list of risks and mitigations
6. **Acceptance Criteria** — checklist of `- [ ]` items that can be verified

**Constraints to follow (from project conventions):**
- All shared types go in `packages/shared/src/types/` and schemas in `packages/shared/src/schemas/`
- Services must not import from `../lib/db` — all DB access via repositories
- Repositories extend `BaseRepository` and implement a typed interface
- All new modules export from an `index.ts` barrel file
- TypeScript `strict: true` — no `any`
- All environment variables validated with Zod in `apps/server/src/env.ts`

---

**Describe the feature you want a spec for:**

$input
