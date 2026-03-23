---
description: "Use when creating or editing React components, hooks, pages, or frontend UI code in apps/client. Covers component patterns, state management, modular CSS styling, responsive layouts, streaming chat rendering, and Vite/React conventions."
applyTo: "apps/client/**"
---

# React Frontend Conventions

## Component Rules

- Use **functional components only** — no class components.
- Every component must be a **named export** in a PascalCase file (e.g., `ChatWindow.tsx`). Never use default exports for components.
- Co-locate component-specific styles, tests, and sub-components in the same folder as the component.
- Extract any logic over ~20 lines into a custom hook in the same folder, named `use<Component>.ts`.
- Reusable UI components must live in `apps/client/src/components/` and page-specific components must live alongside the page that owns them.
- Prefer composition over duplication: if a component or element pattern is reused in more than one feature, extract it into a shared component.
- Shared primitives should be designed as **polymorphic components** when the underlying element may vary (`button`, `a`, `div`, etc.).

```tsx
// ✅ correct
export function ChatMessage({ message }: ChatMessageProps) { ... }

// ❌ wrong
export default function ChatMessage(...) { ... }
```

## Reusable & Polymorphic Components

- Build reusable primitives for repeated UI patterns: buttons, text, surface/card, input wrappers, modal shells, list items, avatars, badges, stacks, grids, and containers.
- If a shared component may need to render different tags, support an `as` prop with properly typed polymorphic props.
- Shared components must expose variants through typed props (`size`, `tone`, `align`, `gap`, `columns`, etc.) instead of ad-hoc class overrides from call sites.
- Keep page files focused on composition; move reusable presentation and layout logic into shared components.

```tsx
type BoxProps<T extends React.ElementType> = {
  as?: T;
  padding?: 'sm' | 'md' | 'lg';
} & React.ComponentPropsWithoutRef<T>;

export function Box<T extends React.ElementType = 'div'>({ as, padding = 'md', ...props }: BoxProps<T>) {
  const Component = as ?? 'div';
  return <Component {...props} />;
}
```

## Hooks

- Custom hooks live in `apps/client/src/hooks/` (shared) or alongside the component (local).
- Hooks must start with `use` and return typed objects, not positional arrays (except where idiomatic—e.g., `useState`).
- Never fetch data directly in a component body — always delegate to a hook.

## State Management

- Prefer local state (`useState`, `useReducer`) and context for simple shared state.
- Use a dedicated state library (e.g., Zustand or Jotai) only if global state grows beyond 2–3 contexts.
- Keep server state (chat history, user info) separate from UI state (modal open, input value).

## Streaming Chat Rendering

- AI responses arrive as a stream; render tokens incrementally using `ReadableStream` or SSE.
- Buffer streamed tokens in a `ref`, flush to state with `useCallback` on each chunk.
- Show a blinking cursor while streaming; hide it on completion or error.

```tsx
// Pattern for streaming into state
const [content, setContent] = useState('');
const bufferRef = useRef('');

onChunk((chunk) => {
  bufferRef.current += chunk;
  setContent(bufferRef.current);  // triggers re-render per chunk
});
```

## Forms & Validation

- Use `react-hook-form` + Zod resolver for all forms. Import schemas from `@ai-chat/shared`.
- Never write inline validation logic — always reference the shared Zod schema.

## Environment Variables

- Access only via `import.meta.env.VITE_*`.
- Validate at app startup in `src/env.ts` using Zod; throw if required vars are absent.

```ts
// src/env.ts
import { z } from 'zod';
const envSchema = z.object({ VITE_API_URL: z.string().url() });
export const env = envSchema.parse(import.meta.env);
```

## Styling

- Use **CSS Modules** as the primary styling approach for components and pages.
- Name style files as `<Component>.module.css` and colocate them with the component.
- Keep selectors scoped and component-oriented; do not rely on global cascading except for reset/theme foundation files.
- Extract repeated styling variants into typed component props or helper maps instead of duplicating class names across files.
- No inline `style` props unless animating dynamic numeric values.

## Theming

- Centralize all theme tokens in CSS custom properties instead of hardcoding colors, spacing, radii, shadows, or font stacks inside component modules.
- Define semantic tokens first (`--color-bg-surface`, `--color-text-primary`, `--color-border-muted`, `--font-sans-ui`, `--radius-md`) and only then map them to brand values.
- Keep light and dark themes in the same token system using theme scopes such as `[data-theme='light']` and `[data-theme='dark']`.
- Components must consume semantic variables, not raw hex values or one-off font declarations.
- Typography must be tokenized too: font family, font sizes, line heights, weights, and letter spacing belong in the theme layer.
- If a component needs visual variants, implement them on top of the shared tokens rather than introducing local color systems.

```css
:root {
  --font-sans-ui: 'Inter', 'Segoe UI', sans-serif;
  --color-bg-app: #f7f5f2;
  --color-bg-surface: #ffffff;
  --color-text-primary: #1b1b18;
  --color-text-muted: #6b6a63;
  --color-accent: #0f766e;
  --color-border-muted: #e7e2d9;
  --radius-md: 16px;
}

[data-theme='dark'] {
  --color-bg-app: #171714;
  --color-bg-surface: #242421;
  --color-text-primary: #f7f3ea;
  --color-text-muted: #b8b1a4;
}
```

```css
.panel {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  border-radius: var(--radius-md);
}
```

## Responsive Design

- Every page, shared component, and major UI element must have responsive behaviour for desktop, tablet, and mobile.
- Design mobile and tablet states intentionally — do not rely on desktop styles collapsing automatically.
- Validate layouts at common breakpoints at minimum: mobile (`320-767px`), tablet (`768-1023px`), desktop (`1024px+`).
- Components must remain usable on touch devices: sufficient spacing, readable typography, and tap targets of at least `44x44px`.
- Do not hardcode widths/heights that break on smaller screens; prefer fluid sizing, wrapping, and responsive variants.

## Layout Components

- Layout primitives such as `Container`, `Stack`, `Inline`, `Grid`, `Flex`, `Section`, and page shells must be extracted into reusable shared components when reused.
- Layout primitives must support responsive variants through props instead of one-off page CSS.
- Layout primitives should also be polymorphic where it improves reuse, for example `Container` rendering as `section`, `main`, or `div`.
- Keep spacing, alignment, columns, and direction configurable with typed props so pages compose layout declaratively.

```tsx
export function Grid<T extends React.ElementType = 'div'>({
  as,
  columns = 'auto',
  gap = 'md',
  ...props
}: GridProps<T>) {
  const Component = as ?? 'div';
  return <Component {...props} />;
}
```

## WebSocket

- Encapsulate all WebSocket logic in a single hook `useWebSocket` (or `useChatSocket`) in `apps/client/src/hooks/`. Never open a `WebSocket` connection directly inside a component.
- The hook is responsible for: connecting, reconnecting with exponential backoff, sending typed messages, and exposing incoming messages via a stable callback or state.

```ts
// hooks/useChatSocket.ts
export function useChatSocket(onMessage: (msg: ServerMessage) => void) {
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(env.VITE_WS_URL);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      const msg = serverMessageSchema.safeParse(JSON.parse(event.data));
      if (msg.success) onMessage(msg.data);
    };

    ws.onerror = (e) => console.error('ws error', e);

    return () => ws.close();
  }, []);  // connect once on mount

  const send = useCallback((msg: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(msg));
  }, []);

  return { send };
}
```

- All incoming message shapes must be validated with Zod schemas imported from `@ai-chat/shared` before use — never access raw `event.data` properties directly.
- All outgoing message types must be `ClientMessage` from `@ai-chat/shared` — never construct ad-hoc objects.
- Implement reconnection: on `close` or `error`, retry with capped exponential backoff (e.g. 1 s → 2 s → 4 s → max 30 s). Stop retrying after a user-visible error state is shown.
- Add a `VITE_WS_URL` variable to `src/env.ts` and validate it with Zod alongside other env vars.
- Expose connection status (`'connecting' | 'open' | 'closed' | 'error'`) from the hook so the UI can show appropriate indicators.

## Accessibility

- Every interactive element needs an accessible label (`aria-label`, `aria-labelledby`, or visible text).
- Use semantic HTML (`<button>`, `<nav>`, `<main>`) over `<div>` with click handlers.
