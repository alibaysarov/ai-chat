---
description: "Use when creating or editing Express routes, middleware, controllers, or server-side code in apps/server. Covers API design, request validation, error handling, authentication middleware, and environment config."
applyTo: "apps/server/**"
---

# Express Backend Conventions

## Router & File Organization

```
apps/server/src/
  routers/          # One file per resource (kebab-case): chat-router.ts
  middleware/       # Shared middleware: auth.ts, error-handler.ts
  services/         # Business logic, no Express types leak in here
  lib/              # Third-party client wrappers (openai.ts, db.ts)
  env.ts            # Validated environment variables
  app.ts            # Express app setup (no listen())
  server.ts         # Entry point: calls app.listen()
```

- Keep Express `Request`/`Response` types out of service functions — services receive plain data, return `Result<T, E>`.
- Routers mount under versioned prefixes: `/api/v1/chat`, `/api/v1/users`.

## Request Validation

- Validate **all** incoming data (body, params, query) with Zod schemas imported from `@ai-chat/shared`.
- Use a `validate` middleware factory to keep route handlers clean:

```ts
// middleware/validate.ts
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    }
    req.body = result.data;
    next();
  };
}
```

## Error Handling

- One centralized error-handler middleware registered last in `app.ts`.
- All thrown errors must be instances of a typed `AppError` class with `statusCode` and `code` fields.
- Never let error details (stack traces, internal messages) reach the client — log internally, respond with `ApiError` shape from `@ai-chat/shared`.

```ts
// Always use next(err) in async routes — never throw unhandled
router.post('/chat', asyncHandler(async (req, res, next) => {
  const result = await chatService.send(req.body);
  if (!result.ok) return next(new AppError(result.error.code, 400));
  res.json(result.value);
}));
```

- Wrap every async route with an `asyncHandler` utility to forward rejections to `next`.

## Authentication

- Validate JWTs in `middleware/auth.ts` using a verified library (e.g., `jose`).
- Attach typed user info to `res.locals.user` — never to `req` directly (avoids prototype pollution).
- Always verify `exp`, `iss`, and `aud` claims. Reject on any failure.

## Streaming Responses (SSE)

- Use Server-Sent Events for streaming AI responses to the client.
- Set headers before writing: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
- Handle `req.on('close', ...)` to abort the upstream AI call when the client disconnects.

```ts
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.flushHeaders();

for await (const chunk of stream) {
  if (req.closed) break;
  res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
}
res.end();
```
- Use websockets and streaming responses for chat responses so if user quit the app answer will be available to him in next session

## Environment Variables

- All env vars validated with Zod at startup in `src/env.ts`. Crash fast if any required var is missing.
- Never access `process.env` directly outside of `src/env.ts`.

```ts
// src/env.ts
import { z } from 'zod';
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  OPENAI_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
});
export const env = schema.parse(process.env);
```

## WebSocket (ws / socket.io)

- Use the `ws` library for raw WebSocket support, or `socket.io` if rooms and namespaces are needed. Choose one and stay consistent.
- Initialise the WebSocket server by attaching it to the same `http.Server` instance as Express — do not open a separate port.

```ts
// server.ts
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './app';

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(env.PORT);
```

- All WebSocket message shapes must be defined as discriminated union types in `packages/shared/src/types/ws.ts` and imported via `@ai-chat/shared`.

```ts
// packages/shared/src/types/ws.ts
export type ClientMessage =
  | { type: 'chat:send'; payload: { conversationId: string; content: string } }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'chat:chunk'; payload: { content: string } }
  | { type: 'chat:done' }
  | { type: 'error'; payload: { code: string; message: string } };
```

- Validate every incoming message with a Zod schema before processing — never trust the raw payload.
- Authenticate the connection on upgrade using the `Authorization` header or a short-lived token in the query string. Reject unauthenticated connections before the handshake completes.

```ts
wss.on('connection', (socket, req) => {
  const user = verifyToken(req);   // throws → connection is closed
  socket.on('message', (raw) => {
    const msg = clientMessageSchema.safeParse(JSON.parse(String(raw)));
    if (!msg.success) return socket.close(1003, 'Invalid message');
    handleMessage(socket, user, msg.data);
  });
  socket.on('error', (err) => logger.error('ws error', err));
});
```

- Always handle the `error` event on every socket — unhandled errors crash the server.
- Send a `ping` frame on an interval and close idle connections that miss two consecutive `pong` replies.
- Never broadcast raw user content to other clients without sanitisation.

## Service Layer

- Services contain **business logic only** — no Express `Request`/`Response` types, no direct DB calls.
- Split public and private methods clearly: public methods form the service API; private methods are internal implementation details.
- Extract reusable helper functions into separate files under `services/helpers/` — never inline utilities that are used in more than one place.
- When multiple services share behaviour (e.g., pagination, soft-delete, audit logging), extract a base abstract class and extend it.
- Apply **SOLID** principles:
  - **S** — one service, one responsibility (e.g., `ChatService` handles chat flow, not user management).
  - **O** — extend behaviour via composition or inheritance, not by modifying existing services.
  - **I** — define narrow interfaces (`IChatService`) rather than fat ones.
  - **D** — depend on interfaces/abstractions injected via constructor, not on concrete implementations.

```ts
// services/chat-service.ts
export class ChatService {
  constructor(private readonly chatRepo: IChatRepository) {}

  async sendMessage(input: SendMessageInput): Promise<Result<ChatMessage, AppError>> {
    const processed = this.preprocessContent(input.content); // private helper
    return this.chatRepo.createMessage({ ...input, content: processed });
  }

  private preprocessContent(content: string): string {
    return content.trim();
  }
}
```

### What NOT to do

- **Don't** put all functions in a single file — decompose by responsibility into separate service files.
- **Don't** make DB queries inside the service — delegate all persistence to a repository.
- **Don't** import Prisma client or any ORM directly in a service file.

## Repository Layer

- All database operations (queries, mutations, transactions) must live in a **repository** class under `repositories/`.
- One repository per domain entity: `ChatRepository`, `ConversationRepository`, etc.
- Define a typed interface for every repository and depend on it in services — never on the concrete class.

```ts
// repositories/interfaces/chat-repository.interface.ts
export interface IChatRepository {
  findById(id: string): Promise<ChatMessage | null>;
  createMessage(data: CreateMessageData): Promise<Result<ChatMessage, AppError>>;
  listByConversation(conversationId: string): Promise<ChatMessage[]>;
}
```

- Shared query patterns (pagination, soft-delete, findById) can be extracted into a generic `BaseRepository` abstract class and reused via inheritance.
- Reuse methods from other repositories by injecting them — never duplicate query logic across repositories.

```ts
// repositories/base.repository.ts
export abstract class BaseRepository<T> {
  constructor(protected readonly db: PrismaClient) {}

  protected async findById(model: string, id: string): Promise<T | null> {
    return (this.db as unknown as Record<string, { findUnique: (args: unknown) => Promise<T | null> }>)[model]
      .findUnique({ where: { id } });
  }
}

// repositories/chat.repository.ts
export class ChatRepository extends BaseRepository<ChatMessage> implements IChatRepository {
  async createMessage(data: CreateMessageData): Promise<Result<ChatMessage, AppError>> {
    // ...
  }
}
```

- Keep file structure flat and predictable:

```
apps/server/src/
  repositories/
    interfaces/         # IChatRepository, IConversationRepository, …
    base.repository.ts  # shared abstract base
    chat.repository.ts
    conversation.repository.ts
  services/
    helpers/            # pure helper functions used across services
    chat-service.ts
    conversation-service.ts
```

## Security Checklist

- Rate-limit all public endpoints with `express-rate-limit`.
- Set security headers with `helmet`.
- Sanitize any user content rendered server-side.
- Never log raw request bodies that may contain secrets or PII.
