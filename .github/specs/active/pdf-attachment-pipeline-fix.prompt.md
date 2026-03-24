---
agent: agent
model: Claude Sonnet 4.5 (copilot)
description: "Fix broken PDF attachment pipeline so extracted text is passed to the AI during chat"
---

# Fix: PDF Attachment Pipeline

## 1. Overview

When a user attaches a PDF file in the chat, the application should:
1. Upload the file to the server (`POST /api/v1/files`) and receive a `fileId`
2. Include that `fileId` when sending the chat message over WebSocket
3. Have the server extract the text from the PDF and inject it into the AI prompt context

Currently **none of these three steps work end-to-end**. Three independent bugs each break the pipeline at a different layer. As a result, the AI always responds with "I can't view attachments" because it never receives the PDF content.

---

## 2. Architecture / Flow

### Expected (fixed) flow

```
Browser (Composer)
  │  User picks file + types message, clicks Send
  │
  ▼
ChatPage.handleSend()
  │  1. POST /api/v1/files  { file, conversationId }
  │     ← returns { fileId, filename }
  │  2. sendChatMessage({ conversationId, content, fileId })
  │
  ▼
useChatSocket.sendChatMessage()
  │  WS message: { type: "chat:send", payload: { conversationId, content, fileId } }
  │
  ▼
server/server.ts  (WebSocket message handler)
  │  chatService.streamChatResponse({ conversationId, content, fileId, ... })
  │
  ▼
ChatService.loadFileContext(fileId)
  │  fileRepo.findById(fileId) → FileAttachment.extractedText
  │
  ▼
ChatService.buildFileContext(text, filename)
  │  Prepends "[Attached file: …]\n\n<text>" to userContent
  │
  ▼
OpenAI Responses API (streaming)
  │  AI sees the PDF text in its context window
  │
  ▼
chat:chunk / chat:done → browser

──────────────────────────────────────
File upload sub-flow (step 1 above):

  POST /api/v1/files
    │  multer parses multipart body
    │  fileService.uploadFile({ buffer, mimeType, ... })
    │    └─ extractText(buffer, mimeType)           ← BUG 1 HERE (wrong pdf-parse API)
    │    └─ fileRepo.create({ …, extractedText })
    ▼
  201 { fileId, filename }
```

### Current broken points

```
BUG 1 ── pdf-extractor.ts ─────────────────────────────────────────────────────
         new PDFParse({data:buffer}).getText()   ← not the real pdf-parse API
         Should be: const data = await pdfParse(buffer); return data.text;
         Effect: file upload throws at runtime → fileId is never created

BUG 2 ── ChatPage.handleSend() ────────────────────────────────────────────────
         Files are never uploaded to /api/v1/files
         Only their names are appended as text in the message content
         Effect: no fileId is ever obtained

BUG 3 ── useChatSocket.sendChatMessage() ──────────────────────────────────────
         SendChatInput interface has no fileId field
         WebSocket message never includes fileId
         Effect: even if fileId existed, server would never receive it
```

---

## 3. File Structure

```
apps/
  server/
    src/
      lib/
        pdf-extractor.ts          ← UPDATED  (fix pdf-parse API call)
  client/
    src/
      hooks/
        useChatSocket.ts          ← UPDATED  (add fileId to SendChatInput + sendChatMessage)
      pages/
        ChatPage/
          ChatPage.tsx            ← UPDATED  (upload file before send, pass fileId)
```

No new files need to be created. No DB schema changes. No new shared types.

---

## 4. Step-by-Step Specification

### 4.1 Shared types / schemas — NO CHANGES REQUIRED

`packages/shared/src/schemas/chat.ts` already defines `fileId` as optional in `clientMessageSchema`:

```ts
payload: z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(MAX_USER_MESSAGE_LENGTH),
  fileId: z.string().uuid().optional(),   // ← already exists
})
```

`packages/shared/src/types/ws.ts` `ClientMessage` already includes `fileId?: string`. No changes needed.

---

### 4.2 Prisma / DB — NO CHANGES REQUIRED

`FileAttachment` model already exists with `extractedText` column. No migration needed.

---

### 4.3 Repository — NO CHANGES REQUIRED

`FileRepository.findById` already returns the full `FileAttachment` record including `extractedText`.

---

### 4.4 Service — NO CHANGES REQUIRED

`ChatService.loadFileContext()` and `FileService.uploadFile()` are correctly implemented. They only fail because of BUG 1 (extractor) and because `fileId` is never supplied (BUG 2 + 3).

---

### 4.5 BUG 1 — Fix `pdf-extractor.ts`

**File:** `apps/server/src/lib/pdf-extractor.ts`

**Problem:** The current code uses `new PDFParse({data: buffer}).getText()` which does not match the real `pdf-parse` npm package API. The `pdf-parse` module exports a default async function, not a class.

**Fix:** Replace the incorrect class-based invocation with the correct function call.

```typescript
// BEFORE (broken)
import { PDFParse } from 'pdf-parse';
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text.trim();
}

// AFTER (correct)
import pdfParse from 'pdf-parse';
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text.trim();
}
```

The rest of `extractText()` (the switch on `mimeType`) remains unchanged.

Also verify that `pdf-parse` and its types are installed:
```bash
# in apps/server/
npm install pdf-parse
npm install --save-dev @types/pdf-parse
```

---

### 4.6 BUG 3 — Fix `useChatSocket.ts`

**File:** `apps/client/src/hooks/useChatSocket.ts`

**Problem:** `SendChatInput` interface and `sendChatMessage` function do not accept or forward `fileId`.

**Fix:** Add `fileId?: string` to `SendChatInput` and include it in the WebSocket payload.

```typescript
// BEFORE
interface SendChatInput {
  conversationId: string;
  content: string;
}

// AFTER
interface SendChatInput {
  conversationId: string;
  content: string;
  fileId?: string;
}
```

```typescript
// BEFORE (inside sendChatMessage)
return sendRawMessage({
  type: 'chat:send',
  payload: {
    conversationId: input.conversationId,
    content: input.content,
  },
});

// AFTER
return sendRawMessage({
  type: 'chat:send',
  payload: {
    conversationId: input.conversationId,
    content: input.content,
    ...(input.fileId !== undefined && { fileId: input.fileId }),
  },
});
```

---

### 4.7 BUG 2 — Fix `ChatPage.tsx`

**File:** `apps/client/src/pages/ChatPage/ChatPage.tsx`

**Problem:** `handleSend` receives `File[]` from `Composer` but never uploads them to the server. It only appends filenames as plain text in the message content. No `fileId` is ever obtained or passed to `sendChatMessage`.

**Fix:** Before sending the WS message, upload each attached file via `POST /api/v1/files`. Pass the resulting `fileId` (first file only, since the existing server/AI pipeline handles one file at a time) to `sendChatMessage`. Keep the message display text clean (no raw filename appended).

**Rules:**
- Use `fetch` with `FormData` — no new HTTP client library needed
- Only the **first** attached file is sent as context (matches current `StreamChatRequest.fileId?: string` — singular)
- If upload fails, show an error and do not send the WS message
- `conversationId` must be sent with the file upload so the server can associate the `FileAttachment` record

**Implementation inside `ChatPage.tsx`:**

1. Extract the file upload helper (inline, not a separate module since it's one call):

```typescript
async function uploadFile(file: File, conversationId: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('conversationId', conversationId);

  const response = await fetch(`${env.VITE_API_URL}/api/v1/files`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`File upload failed: ${response.status}`);
  }

  const json = await response.json() as { fileId: string };
  return json.fileId;
}
```

2. Update `handleSend` to use `async` and call `uploadFile` before `sendChatMessage`:

```typescript
const handleSend = useCallback(async (files: File[]) => {
  const text = input.trim();
  if (!text && files.length === 0) return;

  const conversationId = activeId ?? draftConversationId;

  // Optimistically add user message (show filename label but no raw dump)
  const displayContent = text || 'Attached file';
  const userMessage: ChatMessageType = {
    id: crypto.randomUUID(),
    role: 'user',
    content: files.length > 0 ? `${displayContent} [${files[0].name}]` : displayContent,
    createdAt: new Date(),
  };
  setMessages((prev) => [...prev, userMessage]);
  setInput('');
  setSocketError(null);

  // Upload first file if present
  let fileId: string | undefined;
  if (files.length > 0) {
    try {
      fileId = await uploadFile(files[0], conversationId);
    } catch {
      setSocketError('File upload failed. Please try again.');
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      return;
    }
  }

  const assistantId = crypto.randomUUID();
  setMessages((prev) => [
    ...prev,
    { id: assistantId, role: 'assistant', content: '', createdAt: new Date() },
  ]);
  setStreamingId(assistantId);

  const wasSent = sendChatMessage({ conversationId, content: text || 'Summarize the attached file.', fileId });
  if (!wasSent) {
    setSocketError('WebSocket is not connected yet. Please retry in a second.');
    setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    setStreamingId(null);
  }
}, [activeId, draftConversationId, input, sendChatMessage]);
```

3. Ensure `VITE_API_URL` is available in `apps/client/src/env.ts`. If it is not already declared, add it:

```typescript
// In apps/client/src/env.ts — add if missing:
VITE_API_URL: z.string().url(),
```

And add to `apps/client/.env.example`:
```
VITE_API_URL=http://localhost:3000
```

---

## 5. Security Considerations

| Risk | Mitigation |
|------|------------|
| **Path traversal via filename** | Server uses `multer.memoryStorage()` — file is never written to disk; filename stored as metadata only |
| **MIME type spoofing** | Server checks `req.file.mimetype` against `ALLOWED_MIME_TYPES` whitelist (already implemented in `file-router.ts`) |
| **Oversized upload** | `multer` limits enforced via `MAX_FILE_SIZE_BYTES` (already in place) |
| **Malicious PDF content** | `pdf-parse` extracts text only — no script execution, no rendering |
| **Prompt injection via PDF content** | Text is sliced to `MAX_FILE_CONTEXT_CHARS` (already in `ChatService`); user cannot exceed this. Consider adding a note in the system prompt that attached content may be untrusted |
| **Unauthenticated file upload** | Currently no auth — acceptable for local dev; production must gate upload endpoint behind auth middleware |
| **XSS via filename in UI** | React renders filename as JSX text nodes — automatically escaped, no `dangerouslySetInnerHTML` |
| **Unbounded file accumulation in DB** | `extractedText` stored as `@db.Text` — large files consume DB space. `MAX_FILE_SIZE_BYTES` (10 MB) and `MAX_FILE_CONTEXT_CHARS` (20k chars) bound the impact |

---

## 6. Acceptance Criteria

- [ ] `POST /api/v1/files` with a valid PDF returns `201 { fileId, filename }` and stores `extractedText` in the DB (verify with `SELECT extracted_text FROM file_attachments LIMIT 1`)
- [ ] `POST /api/v1/files` with a corrupted or empty PDF returns a `500` with `FILE_PROCESSING_FAILED` code (does not crash the server)
- [ ] `POST /api/v1/files` with an unsupported MIME type (e.g. `image/png`) returns `415`
- [ ] After attaching a PDF and sending a message, the AI response references content from the PDF (e.g. candidate name, skills from a CV)
- [ ] The WS message sent to the server includes `fileId` when a file is attached (verify in browser DevTools → WS frame)
- [ ] When the file upload fails (simulate with network tab throttle / block), the user sees an error and no WS message is sent
- [ ] Attaching no file still works — plain text messages unaffected
- [ ] `useChatSocket.sendChatMessage` TypeScript signature accepts `fileId?: string` with no type errors (`tsc --noEmit` passes)
- [ ] `extractTextFromPdf` compiles and runs without runtime error — `import pdfParse from 'pdf-parse'` resolves correctly
- [ ] `@types/pdf-parse` is installed so TypeScript can type-check the import
