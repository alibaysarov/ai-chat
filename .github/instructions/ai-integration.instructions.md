---
description: "Use when integrating AI/LLM APIs (OpenAI, Anthropic, etc.), implementing chat completion logic, managing prompts, handling streaming responses, or working with token limits. Covers provider abstraction, prompt patterns, retry logic, and cost-aware design."
---

# AI / LLM Integration Conventions

## Provider Abstraction

- Wrap LLM provider SDKs (OpenAI, Anthropic, etc.) behind a shared interface so the provider can be swapped without changing call sites.
- Instantiate the client once in `apps/server/src/lib/ai-client.ts` and inject it — never `new OpenAI()` inline in routes or services.

```ts
// lib/ai-client.ts
import OpenAI from 'openai';
import { env } from '../env';

export const aiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
```

## Prompt Management

- Store system prompts as constants in `apps/server/src/prompts/` — one file per use-case (e.g., `chat-system.ts`).
- Never hard-code multi-line prompt strings inside service functions.
- Parameterize prompts with typed inputs; build the final string from a builder function.

```ts
// prompts/chat-system.ts
export function buildSystemPrompt(opts: { userName: string }): string {
  return `You are a helpful assistant. The user's name is ${opts.userName}.`;
}
```

## Chat History Management

- Store conversation history as `ChatMessage[]` (from `@ai-chat/shared`).
- Truncate history to fit within the model's context window before each API call.
- Track token usage by using the model's `usage` response field — never estimate.
- Apply a rolling window: keep the system prompt + last N messages that fit within `MAX_CONTEXT_TOKENS`.

```ts
// Constant in packages/shared/src/constants.ts
export const MAX_CONTEXT_TOKENS = 6000;
```

## Streaming

- Always prefer streaming completions (`stream: true`) — never block waiting for the full response.
- On the server: use `for await` over the stream, forwarding chunks via SSE (see backend instructions).
- On the client: consume SSE with `EventSource` or `fetch` + `ReadableStream`; update UI incrementally.
- Abort the upstream AI request when the client disconnects to avoid wasted token spend.

## Error Handling & Retries

- Catch provider-specific errors (rate limits `429`, server errors `5xx`) and convert to `AppError`.
- Retry on `429` with exponential backoff (max 3 attempts) using a utility like `p-retry`.
- Surface model-level errors (content filter, context length exceeded) as distinct error codes in `ApiError`.

```ts
import pRetry from 'p-retry';

const completion = await pRetry(
  () => aiClient.responses.create(params),
  { retries: 3, onFailedAttempt: (e) => logger.warn('AI retry', e) }
);
```

## Security & Cost Controls

- **Never** pass raw user messages to the AI without first applying content moderation or length limits.
- Enforce a `MAX_USER_MESSAGE_LENGTH` constant (shared) before sending to the API.
- Log token usage per request to enable cost monitoring — never silently discard the `usage` field.
- API keys must live exclusively in environment variables — never in source code or client bundles.

## Types

Define all AI-related domain types in `packages/shared/src/types/chat.ts`:

```ts
export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface ChatCompletionRequest {
  conversationId: string;
  userMessage: string;
}
```
