---
agent: agent
description: "Refactor chat-service.ts: extract repository layer, decompose helpers, introduce interfaces and class-based structure following backend conventions."
model: Claude Sonnet 4.5 (copilot)
---

# Refactor: `chat-service.ts`

## Context

Current file: `apps/server/src/services/chat-service.ts`

### Problems to fix

| # | Problem | Rule violated |
|---|---------|---------------|
| 1 | Direct Prisma calls (`db.conversation.upsert`, `db.message.findMany`, `db.message.create`, `db.conversation.update`) inside the service | No DB queries in service |
| 2 | Helper functions (`estimateTokens`, `trimHistoryToWindow`, `toInputMessage`, `mapServiceError`) live in the same file as business logic | Helpers must be extracted to separate files |
| 3 | Single procedural function `streamChatResponse` — no public/private separation | Use class with explicit visibility |
| 4 | No interface for the service | SOLID: depend on abstraction |
| 5 | AI retry/streaming logic mixed with persistence logic | Single Responsibility |

---

## Target File Structure

```
apps/server/src/
  repositories/
    interfaces/
      conversation-repository.interface.ts   ← NEW
      message-repository.interface.ts        ← NEW
    base.repository.ts                        ← NEW
    conversation.repository.ts               ← NEW
    message.repository.ts                    ← NEW
  services/
    interfaces/
      chat-service.interface.ts              ← NEW
    helpers/
      token-utils.ts                         ← NEW  (estimateTokens, trimHistoryToWindow)
      message-mapper.ts                      ← NEW  (toInputMessage)
      error-mapper.ts                        ← NEW  (mapServiceError)
    chat-service.ts                          ← REFACTORED (class, no DB)
```

---

## Step-by-step Specification

### 1. Interfaces

**`repositories/interfaces/conversation-repository.interface.ts`**
```ts
import type { Conversation } from '@prisma/client';

export interface IConversationRepository {
  upsert(id: string): Promise<Conversation>;
  updateTitle(id: string, title: string): Promise<void>;
}
```

**`repositories/interfaces/message-repository.interface.ts`**
```ts
import type { Message } from '@prisma/client';

export interface IMessageRepository {
  findByConversation(conversationId: string, limit: number): Promise<Message[]>;
  create(data: { conversationId: string; role: string; content: string }): Promise<Message>;
}
```

**`services/interfaces/chat-service.interface.ts`**
```ts
import type { Result, ChatMessage } from '@ai-chat/shared';
import type { ChatServiceError, StreamChatRequest, StreamChatResponse } from '../chat-service';

export interface IChatService {
  streamChatResponse(request: StreamChatRequest): Promise<Result<StreamChatResponse, ChatServiceError>>;
}
```

---

### 2. Repositories

**`repositories/base.repository.ts`**
- Abstract class `BaseRepository` that receives `PrismaClient` via constructor.
- No shared methods needed for now — exists as a base for future extension.

**`repositories/conversation.repository.ts`**
- `ConversationRepository extends BaseRepository implements IConversationRepository`
- `upsert(id)`: `db.conversation.upsert({ where: { id }, update: {}, create: { id } })`
- `updateTitle(id, title)`: `db.conversation.update({ where: { id }, data: { title } })`

**`repositories/message.repository.ts`**
- `MessageRepository extends BaseRepository implements IMessageRepository`
- `findByConversation(conversationId, limit)`: `db.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: limit })`
- `create(data)`: `db.message.create({ data })`

---

### 3. Helper files

**`services/helpers/token-utils.ts`**
- Export `estimateTokens(text: string): number` — move as-is from `chat-service.ts`
- Export `trimHistoryToWindow(history, systemPrompt, userMessage): ChatMessage[]` — move as-is

**`services/helpers/message-mapper.ts`**
- Export `toInputMessage(message: ChatMessage): EasyInputMessage` — move as-is

**`services/helpers/error-mapper.ts`**
- Export `mapServiceError(error: unknown): ChatServiceError` — move as-is
- Keep the `AbortError` and `OpenAI.APIError` handling logic unchanged

Each helper file must re-export from `services/helpers/index.ts` barrel.

---

### 4. Refactored `ChatService` class

**`services/chat-service.ts`**

```ts
export class ChatService implements IChatService {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  // PUBLIC — service API
  async streamChatResponse(
    request: StreamChatRequest,
  ): Promise<Result<StreamChatResponse, ChatServiceError>> { ... }

  // PRIVATE — internal steps
  private async persistUserMessage(...) { ... }
  private async buildInputHistory(...) { ... }
  private async runStreamWithRetry(...) { ... }
  private async persistAssistantMessage(...) { ... }
  private logUsage(...) { ... }
}
```

**Rules for the class:**
- Constructor receives `IConversationRepository` and `IMessageRepository` — no `db` import directly.
- `streamChatResponse` is the only public method.
- Each logical step (persist user message, build history, stream AI, persist assistant message) becomes a **private method**.
- All helper calls (`trimHistoryToWindow`, `toInputMessage`, `mapServiceError`) are imported from `services/helpers/`.
- Keep retry logic (`pRetry`) inside `private runStreamWithRetry()`.
- Keep `StreamChatRequest`, `StreamChatResponse`, `ChatServiceError` as exported types at the top of the file.

---

### 5. Wiring

In `routers/` (or wherever the service is instantiated), create concrete instances and inject:

```ts
import { db } from '../lib/db';
import { ConversationRepository } from '../repositories/conversation.repository';
import { MessageRepository } from '../repositories/message.repository';
import { ChatService } from '../services/chat-service';

const chatService = new ChatService(
  new ConversationRepository(db),
  new MessageRepository(db),
);
```

---

## Acceptance Criteria

- [ ] `chat-service.ts` contains **zero** imports from `../lib/db` or `@prisma/client`
- [ ] All Prisma calls are inside `repositories/conversation.repository.ts` and `repositories/message.repository.ts`
- [ ] `estimateTokens`, `trimHistoryToWindow`, `toInputMessage`, `mapServiceError` live only in `services/helpers/`
- [ ] `ChatService` is a class with a single public method `streamChatResponse`
- [ ] `IConversationRepository` and `IMessageRepository` interfaces exist and are used in the service constructor
- [ ] `IChatService` interface exists and `ChatService` implements it
- [ ] All new files export from their respective `index.ts` barrel files
- [ ] No TypeScript errors (`strict: true`)
- [ ] Existing runtime behaviour is **unchanged** — same retry logic, same prompt building, same response shape
