---
agent: agent
model: Claude Sonnet 4.6 (copilot)
description: "Integrate Zapier Actions API with OpenAI function calling to allow the AI to append user messages to Google Sheets"
---

# Spec: Zapier MCP + OpenAI Function Calling → Google Sheets

## 1. Overview

Enable the AI assistant to call external tools (specifically Google Sheets) via **Zapier Actions API** using **OpenAI Function Calling** (Responses API `tools` param).

When a user asks the assistant to "save this to a table", "record this", or "add to spreadsheet", the model detects the intent and issues a function call. The server intercepts the tool call event in the streaming loop, executes the corresponding Zapier action (Append Row to Google Sheets), injects the tool result back into the conversation, and lets OpenAI generate a confirmation message — all within the same streaming response.

**Why this approach over n8n webhook?**
- The AI decides *when* to save (no UI checkbox required).
- Works inside the existing WebSocket streaming pipeline with no protocol changes.
- Zapier handles Google OAuth separately from the app.

---

## 2. Architecture / Flow

```
User (browser)
   │
   │  WebSocket: { type: "chat:send", payload: { content: "save this to sheet" } }
   ▼
server.ts (WS handler)
   │
   ▼
ChatService.streamChatResponse()
   │
   ├─► OpenAI Responses API  (stream: true, tools: [zapierTools])
   │        │
   │        │  event: response.output_text.delta  ──► onChunk() ──► WS → browser
   │        │
   │        │  event: response.function_call_arguments.done
   │        │        name: "google_sheets_append_row"
   │        │        args: { row_data: "...", spreadsheet_id: "..." }
   │        ▼
   ├─► ZapierToolsClient.executeAction(name, args)
   │        │
   │        │  POST https://actions.zapier.com/api/v2/...
   │        ▼
   │     Zapier Actions API
   │        │
   │        ▼
   │     Google Sheets API  ──► Row appended
   │        │
   │        │  { status: "success" }
   │        ▼
   ├─► OpenAI Responses API  (second call: inject tool output, continue stream)
   │        │
   │        │  event: response.output_text.delta  ──► onChunk() ──► WS → browser
   │        ▼
   └─► ChatService persists full assistant message to DB
```

---

## 3. New File Structure

```
packages/shared/src/
  types/
    tools.ts                          ← NEW   (ZapierAction, OpenAITool, ToolCallEvent types)
  types/index.ts                      ← UPDATED (re-export tools.ts)

apps/server/src/
  lib/
    zapier-tools.ts                   ← NEW   (ZapierToolsClient class: loadTools, executeAction)
    index.ts                          ← UPDATED (re-export ZapierToolsClient)

  services/
    chat-service.ts                   ← UPDATED (pass tools to OpenAI, handle function_call events)
    interfaces/
      chat-service.interface.ts       ← UPDATED (StreamChatRequest gets optional toolsEnabled)

  prompts/
    chat-system.ts                    ← UPDATED (add tool-use instruction when tools loaded)

  env.ts                              ← UPDATED (add ZAPIER_ACTIONS_API_KEY, ZAPIER_ACTIONS_API_URL)

.env.local                            ← UPDATED (add ZAPIER_ACTIONS_API_KEY, ZAPIER_ACTIONS_API_URL)
.env.example                          ← UPDATED (add ZAPIER_ACTIONS_API_KEY, ZAPIER_ACTIONS_API_URL)
```

---

## 4. Step-by-Step Specification

### 4.1 Shared Types (`packages/shared/src/types/tools.ts`)

```typescript
// packages/shared/src/types/tools.ts

/** A single action exposed by Zapier Actions API */
export interface ZapierAction {
  id: string;
  operation_id: string;       // used as OpenAI tool name
  description: string;
  params: Record<string, string>; // param_name → human description
}

/** OpenAI Responses API tool definition */
export interface OpenAIToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

/** Parsed tool call emitted by OpenAI in the stream */
export interface ToolCallEvent {
  callId: string;
  name: string;
  arguments: Record<string, string>;
}
```

Update `packages/shared/src/types/index.ts`:
```typescript
export * from './chat';
export * from './errors';
export * from './ws';
export * from './file';
export * from './tools';   // ← ADD
```

No Zod schema needed for these (server-internal types, not user input).  
The Zapier API *response* is validated in the lib wrapper (see §4.4).

---

### 4.2 Prisma — No Changes

No new DB models required. Tool calls and their results are ephemeral — only the final assistant message text is persisted (existing behaviour).

---

### 4.3 Repository — No Changes

Tool execution does not touch the database. All DB access remains through existing repositories.

---

### 4.4 New Lib: `ZapierToolsClient` (`apps/server/src/lib/zapier-tools.ts`)

```typescript
import { z } from 'zod';
import type { OpenAIToolDefinition, ZapierAction } from '@ai-chat/shared';
import { env } from '../env';

// ── Zod validation for Zapier API responses ──────────────────────────────────

const zapierActionSchema = z.object({
  id: z.string(),
  operation_id: z.string(),
  description: z.string(),
  params: z.record(z.string()),
});

const zapierActionsListSchema = z.object({
  results: z.array(zapierActionSchema),
});

const zapierExecuteResultSchema = z.object({
  status: z.string(),
  result: z.unknown().optional(),
}).passthrough();

// ── Converter ────────────────────────────────────────────────────────────────

function toOpenAITool(action: ZapierAction): OpenAIToolDefinition {
  const properties: Record<string, { type: string; description: string }> = {};

  for (const [name, description] of Object.entries(action.params)) {
    properties[name] = { type: 'string', description };
  }

  return {
    type: 'function',
    name: action.operation_id,
    description: action.description,
    parameters: {
      type: 'object',
      properties,
      required: Object.keys(action.params),
    },
  };
}

// ── Client class ─────────────────────────────────────────────────────────────

export class ZapierToolsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /** Fetch all configured Zapier actions and return as OpenAI tool definitions. */
  async loadTools(): Promise<OpenAIToolDefinition[]> {
    const res = await fetch(`${this.baseUrl}/api/v2/configuration/actions/`, {
      headers: this.headers,
    });

    if (!res.ok) {
      console.error(`[zapier] loadTools HTTP ${res.status}`);
      return [];
    }

    const raw = zapierActionsListSchema.safeParse(await res.json());
    if (!raw.success) {
      console.error('[zapier] loadTools parse error', raw.error.flatten());
      return [];
    }

    return raw.data.results.map(toOpenAITool);
  }

  /**
   * Execute a Zapier action by operation_id.
   * Returns a JSON string to pass back to OpenAI as the function_call_output.
   */
  async executeAction(
    operationId: string,
    params: Record<string, string>,
  ): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/api/v2/configuration/actions/${operationId}/execute/`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ params }),
      },
    );

    if (!res.ok) {
      const errBody = `Zapier action "${operationId}" failed with HTTP ${res.status}`;
      console.error(`[zapier] executeAction ${errBody}`);
      return JSON.stringify({ error: errBody });
    }

    const raw = zapierExecuteResultSchema.safeParse(await res.json());
    if (!raw.success) {
      return JSON.stringify({ error: 'Zapier returned unexpected response shape' });
    }

    return JSON.stringify(raw.data);
  }
}

// Singleton — constructed after env is validated
export const zapierToolsClient = new ZapierToolsClient(
  env.ZAPIER_ACTIONS_API_URL,
  env.ZAPIER_ACTIONS_API_KEY,
);
```

Update `apps/server/src/lib/index.ts` — add:
```typescript
export * from './zapier-tools';
```

---

### 4.5 Environment Variables (`apps/server/src/env.ts`)

Add to the existing Zod schema:

```typescript
ZAPIER_ACTIONS_API_KEY: z.string().min(1),
ZAPIER_ACTIONS_API_URL: z.string().url().default('https://actions.zapier.com'),
```

Add to `.env.local` and `.env.example`:
```
ZAPIER_ACTIONS_API_KEY=your_zapier_api_key_here
ZAPIER_ACTIONS_API_URL=https://actions.zapier.com
```

---

### 4.6 Service Changes (`apps/server/src/services/chat-service.ts`)

#### 4.6.1 Inject ZapierToolsClient

```typescript
// Constructor adds zapierTools param (optional, defaults to no tools)
constructor(
  private readonly conversationRepo: IConversationRepository,
  private readonly messageRepo: IMessageRepository,
  private readonly fileRepo: IFileRepository,
  private readonly zapierClient: ZapierToolsClient,   // ← ADD
) {}
```

#### 4.6.2 Load tools once at startup

Inside `streamChatResponse()`, before calling `runStreamWithRetry`:

```typescript
const tools = await this.zapierClient.loadTools();
```

Pass `tools` into `runStreamWithRetry()`.

#### 4.6.3 `runStreamWithRetry` — handle tool call events

The OpenAI Responses API emits these relevant event types when tools are present:
- `response.output_text.delta` — text chunk (existing)
- `response.function_call_arguments.done` — model chose to call a tool
- `response.completed` — stream is done (existing)

Extend the streaming loop:

```typescript
for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    // existing behaviour
    streamedAnyChunk = true;
    responseText += event.delta;
    request.onChunk(event.delta);

  } else if (event.type === 'response.function_call_arguments.done') {
    // Tool call detected
    const callId = event.call_id;
    const toolName = event.name;
    let toolArgs: Record<string, string>;

    try {
      toolArgs = JSON.parse(event.arguments) as Record<string, string>;
    } catch {
      toolArgs = {};
    }

    // Execute the Zapier action
    const toolResult = await this.zapierClient.executeAction(toolName, toolArgs);

    // Inject function_call + function_call_output then continue stream
    const continueStream = await aiClient.responses.create(
      {
        model: CHAT_MODEL,
        stream: true,
        instructions: systemPrompt,
        tools,
        input: [
          ...history.map(toInputMessage),
          { role: 'user', content: request.content },
          {
            type: 'function_call',
            name: toolName,
            call_id: callId,
            arguments: event.arguments,
          },
          {
            type: 'function_call_output',
            call_id: callId,
            output: toolResult,
          },
        ],
      },
      { signal: request.signal },
    );

    for await (const contEvent of continueStream) {
      if (contEvent.type === 'response.output_text.delta') {
        streamedAnyChunk = true;
        responseText += contEvent.delta;
        request.onChunk(contEvent.delta);
      } else if (contEvent.type === 'response.completed') {
        const usage = contEvent.response.usage;
        if (usage) {
          usageState.value = {
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
            totalTokens: usage.total_tokens,
          };
        }
      }
    }

  } else if (event.type === 'response.completed') {
    // existing behaviour
    const usage = event.response.usage;
    if (usage) {
      usageState.value = {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.total_tokens,
      };
    }
  }
}
```

---

### 4.7 Prompt Changes (`apps/server/src/prompts/chat-system.ts`)

Add a conditional instruction when tools are present:

```typescript
interface BuildChatSystemPromptOptions {
  assistantName?: string;
  hasTools?: boolean;  // ← ADD
}

export function buildChatSystemPrompt(
  options: BuildChatSystemPromptOptions = {},
): string {
  const assistantName = options.assistantName ?? 'AI Chat Assistant';

  const lines = [
    `You are ${assistantName}, a concise and helpful assistant.`,
    'Provide accurate answers, ask clarifying questions when context is missing, and be explicit about uncertainty.',
    'When returning code, keep it practical and production-minded.',
  ];

  if (options.hasTools) {
    lines.push(
      'You have access to tools. When the user asks to save, record, add, or write something to a table or spreadsheet, use the appropriate tool. Confirm to the user after the tool completes successfully.',
    );
  }

  return lines.join(' ');
}
```

In `ChatService.runStreamWithRetry`, pass `hasTools: tools.length > 0` to `buildChatSystemPrompt`.

---

### 4.8 Wiring in `server.ts`

Update ChatService instantiation to pass `zapierToolsClient`:

```typescript
import { zapierToolsClient } from './lib';

const chatService = new ChatService(
  new ConversationRepository(db),
  new MessageRepository(db),
  new FileRepository(db),
  zapierToolsClient,   // ← ADD
);
```

---

### 4.9 Zapier Setup (Manual steps)

1. Go to [actions.zapier.com](https://actions.zapier.com) → **Actions**
2. Create action: **Google Sheets → Create Spreadsheet Row**
3. Connect your Google account and select target sheet
4. Map columns to params — recommended params:
   - `row_data` (string) — the content to record
   - `conversation_id` (string) — for traceability
5. Copy the **API Key** from the Credentials section
6. Set `ZAPIER_ACTIONS_API_KEY` in `.env.local`

---

## 5. Security Considerations

| Risk | Mitigation |
|------|------------|
| **Prompt injection via tool args** — malicious user crafts a message that makes the model pass dangerous values to Zapier | Validate `toolArgs` shape with Zod before passing to `executeAction`; `params` values must be strings ≤ 1000 chars |
| **Zapier API key exposure** | Stored only in `env.ts` (server-side, never sent to client); validated at startup |
| **SSRF via `ZAPIER_ACTIONS_API_URL`** | Validated as `z.string().url()` in env schema; only `https://actions.zapier.com` expected; consider allowlisting with `z.literal()` |
| **Model calling unintended tools** | Tools loaded from Zapier are scoped to actions explicitly configured by the operator in Zapier dashboard — not arbitrary |
| **Excessive Zapier API calls** | loadTools() result should be cached at service construction time (startup), not on every message |
| **Tool result injected into conversation** | Tool result `output` is a JSON string from Zapier — it must be JSON-serialised (never raw HTML/SQL) before passing to OpenAI |
| **Unbounded tool call loops** | Limit nested `continueStream` calls to a single level — do not allow the continue-stream to trigger another tool call recursively |

---

## 6. Acceptance Criteria

- [ ] `ZapierToolsClient.loadTools()` fetches actions from Zapier and returns valid `OpenAIToolDefinition[]`
- [ ] If `ZAPIER_ACTIONS_API_KEY` is missing, the server crashes at startup with a clear Zod validation error
- [ ] `ZapierToolsClient.executeAction()` POSTs to Zapier and returns a JSON string
- [ ] If Zapier returns a non-2xx status, `executeAction()` returns `{ error: "..." }` without throwing
- [ ] OpenAI Responses API call includes the `tools` array when tools are available
- [ ] When the model emits `response.function_call_arguments.done`, `executeAction()` is called with the parsed args
- [ ] The tool result is injected back into OpenAI as `function_call_output` and the response continues streaming
- [ ] The final assistant message (including the confirmation text) is persisted to the DB as a single record
- [ ] The browser receives all text chunks seamlessly via WebSocket — no protocol changes required
- [ ] When the user asks "add this to the spreadsheet: [text]", a row is appended in Google Sheets
- [ ] System prompt includes tool-use instruction only when `tools.length > 0`
- [ ] `toolArgs` values are validated as `Record<string, string>` before being sent to Zapier
- [ ] No `any` types introduced; `strict: true` passes in all affected packages
- [ ] `ZAPIER_ACTIONS_API_KEY` and `ZAPIER_ACTIONS_API_URL` are present in `.env.example`
- [ ] All new exports go through `index.ts` barrel files
