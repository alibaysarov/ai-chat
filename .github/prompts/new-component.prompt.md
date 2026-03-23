---
description: "Scaffold a new React component in apps/client: component file, types, custom hook (if needed), and barrel export. Provide the component name and a brief description of what it renders or does."
argument-hint: "e.g. ChatMessage — renders a single chat bubble with role, content, and timestamp"
agent: "agent"
tools: [search, editFiles, problems]
---

Follow the [frontend instructions](../instructions/frontend.instructions.md) throughout.

## Task

Scaffold a complete React component for the following:

**$input** <!-- e.g. "ChatInput — a textarea with a send button that submits a message, disabled while streaming" -->

---

## Steps to complete

### 1. Determine the right location

- Shared/reusable UI → `apps/client/src/components/<ComponentName>/`
- Page-specific → `apps/client/src/pages/<PageName>/components/<ComponentName>/`

### 2. Define props type (`<ComponentName>.tsx`)

- Declare a `<ComponentName>Props` interface at the top of the file.
- All prop types must reference types from `@ai-chat/shared` where applicable (e.g. `ChatMessage`, `MessageRole`).
- No `any` — use explicit types or generics.

### 3. Write the component

- Named export only — no default exports.
- If the component needs data fetching, effects, or non-trivial state (>~20 lines of logic), extract that into `use<ComponentName>.ts` in the same folder.
- Use Tailwind utility classes for styling; extract repeated class combos with `cva` if there are variants.
- Every interactive element must have an accessible label.

```tsx
// ✅ correct shape
export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  return (
    <article aria-label={`Message from ${message.role}`}>
      ...
    </article>
  );
}
```

### 4. Custom hook (if needed) — `use<ComponentName>.ts`

- Return a typed object (not a positional array).
- No data fetching directly in the hook body — call an existing API hook or service.
- If streaming state is involved, apply the buffered-ref pattern from the frontend instructions.

### 5. Barrel export

- Add the component (and hook if created) to the folder's `index.ts`.
- If this is in `src/components/`, ensure `src/components/index.ts` also re-exports it.

### 6. Verify

- Run `get_errors` on all modified files and fix any TypeScript errors.

---

## Constraints

- No class components. No default exports for components.
- Never import types directly from `apps/server` — always use `@ai-chat/shared`.
- No inline `style` props unless animating dynamic numeric values.
- Environment variables only via `env` from `src/env.ts`, never raw `import.meta.env`.
