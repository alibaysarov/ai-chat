---
agent: agent
description: "Feature: file attachments in chat. Upload PDF (and other files) from the client, extract text server-side, inject into AI context, store metadata in DB."
---

# Feature: File Attachments in Chat

## Overview

Users can attach files (PDF, TXT, DOCX) to a chat message. The server extracts text content from the file and injects it as context into the AI conversation. The current model (`gpt-4o-mini`) does not support native PDF vision — text extraction is done server-side with `pdf-parse`.

---

## Architecture

### Flow

```
Client                       Server
  │                             │
  │── POST /api/v1/files ──────▶│  multer parses multipart
  │   (multipart/form-data)     │  FileService extracts text
  │                             │  FileRepository saves to DB
  │◀─ { fileId, filename } ────│
  │                             │
  │── WS: chat:send ───────────▶│  payload includes fileId
  │   { conversationId,         │  ChatService loads file text
  │     content, fileId? }      │  injects as context prefix
  │◀─ WS: chat:chunk ... ──────│
  │◀─ WS: chat:done ───────────│
```

### New file structure

```
apps/server/src/
  routers/
    file-router.ts               ← NEW: POST /api/v1/files
  services/
    file-service.ts              ← NEW: upload + extraction logic
    interfaces/
      file-service.interface.ts  ← NEW
  repositories/
    file.repository.ts           ← NEW
    interfaces/
      file-repository.interface.ts ← NEW
  lib/
    pdf-extractor.ts             ← NEW: wraps pdf-parse

packages/shared/src/
  types/
    file.ts                      ← NEW: FileAttachment, FileUploadResponse
  schemas/
    file.ts                      ← NEW: Zod schemas for upload/WS

prisma/schema.prisma             ← UPDATED: add FileAttachment model
```

---

## Step-by-step Specification

### 1. Prisma model

Add to `prisma/schema.prisma`:

```prisma
model FileAttachment {
  id               String   @id @default(uuid())
  conversationId   String?  @map("conversation_id")
  originalFilename String   @map("original_filename")
  mimeType         String   @map("mime_type")
  sizeBytes        Int      @map("size_bytes")
  extractedText    String   @map("extracted_text") @db.Text
  createdAt        DateTime @default(now()) @map("created_at")

  conversation Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)

  @@index([conversationId])
  @@map("file_attachments")
}
```

Add `fileAttachments FileAttachment[]` to the `Conversation` model.

After editing schema, run migration:
```
prisma migrate dev --name add_file_attachments
```

### 2. Shared types (`packages/shared/src/types/file.ts`)

```ts
export interface FileAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface FileUploadResponse {
  fileId: string;
  filename: string;
}
```

### 3. Shared schemas (`packages/shared/src/schemas/file.ts`)

```ts
import { z } from 'zod';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = ['application/pdf', 'text/plain'] as const;

export const fileUploadResponseSchema = z.object({
  fileId: z.string().uuid(),
  filename: z.string().min(1),
});
```

Update `packages/shared/src/schemas/index.ts` to export from `./file`.
Update `packages/shared/src/types/index.ts` to export from `./file`.

Also extend WS types in `packages/shared/src/types/ws.ts`:

```ts
// Extend ClientMessage union:
| {
    type: 'chat:send';
    payload: {
      conversationId: string;
      content: string;
      fileId?: string;          // ← ADD optional fileId
    };
  }
```

Update the `clientMessageSchema` in `packages/shared/src/schemas/chat.ts` to add `fileId: z.string().uuid().optional()` to the `chat:send` payload.

### 4. Server env (`apps/server/src/env.ts`)

No new env vars required — files are stored in the DB as extracted text (no file system storage).

### 5. `lib/pdf-extractor.ts`

Install dependency: `npm install pdf-parse --workspace=apps/server`
Install types: `npm install --save-dev @types/pdf-parse --workspace=apps/server`

```ts
// lib/pdf-extractor.ts
import pdfParse from 'pdf-parse';

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text.trim();
}
```

For plain text files, extraction is trivial: `buffer.toString('utf-8').trim()`.

A helper `extractText(buffer: Buffer, mimeType: string)` should dispatch by mimeType:
- `application/pdf` → `extractTextFromPdf`
- `text/plain` → `buffer.toString('utf-8').trim()`
- Any other → throw `AppError('UNSUPPORTED_FILE_TYPE', 415)`

### 6. Repository interfaces

**`repositories/interfaces/file-repository.interface.ts`**

```ts
import type { FileAttachment } from '@prisma/client';

export interface IFileRepository {
  create(data: {
    conversationId?: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    extractedText: string;
  }): Promise<FileAttachment>;

  findById(id: string): Promise<FileAttachment | null>;
}
```

### 7. `repositories/file.repository.ts`

```ts
export class FileRepository extends BaseRepository implements IFileRepository {
  async create(data): Promise<FileAttachment> {
    return this.db.fileAttachment.create({ data });
  }

  async findById(id: string): Promise<FileAttachment | null> {
    return this.db.fileAttachment.findUnique({ where: { id } });
  }
}
```

### 8. Service interface (`services/interfaces/file-service.interface.ts`)

```ts
import type { Result } from '@ai-chat/shared';
import type { FileUploadResponse } from '@ai-chat/shared';
import type { AppError } from '../types/app-error';

export interface UploadFileInput {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  conversationId?: string;
}

export interface IFileService {
  uploadFile(input: UploadFileInput): Promise<Result<FileUploadResponse, AppError>>;
  getExtractedText(fileId: string): Promise<Result<string, AppError>>;
}
```

### 9. `services/file-service.ts`

```ts
export class FileService implements IFileService {
  constructor(private readonly fileRepo: IFileRepository) {}

  async uploadFile(input: UploadFileInput): Promise<Result<FileUploadResponse, AppError>> {
    const extractedText = await extractText(input.buffer, input.mimeType);

    const record = await this.fileRepo.create({
      conversationId: input.conversationId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      extractedText,
    });

    return ok({ fileId: record.id, filename: record.originalFilename });
  }

  async getExtractedText(fileId: string): Promise<Result<string, AppError>> {
    const record = await this.fileRepo.findById(fileId);
    if (!record) return err(new AppError('FILE_NOT_FOUND', 404));
    return ok(record.extractedText);
  }
}
```

### 10. `routers/file-router.ts`

- Use `multer` with memoryStorage (no disk writes).
- Single route: `POST /api/v1/files`
- Validate file presence, MIME type, and size before processing.
- Wire `FileService` with `FileRepository`.

```ts
import multer from 'multer';
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { AppError } from '../types/app-error';
import { db } from '../lib/db';
import { FileRepository } from '../repositories/file.repository';
import { FileService } from '../services/file-service';
import { MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from '@ai-chat/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const fileService = new FileService(new FileRepository(db));

export const fileRouter = Router();

fileRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('NO_FILE_PROVIDED', 400);

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(req.file.mimetype)) {
      throw new AppError('UNSUPPORTED_FILE_TYPE', 415);
    }

    const result = await fileService.uploadFile({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      conversationId: req.body.conversationId as string | undefined,
    });

    if (!result.ok) throw result.error;
    res.status(201).json(result.value);
  }),
);
```

Install multer: `npm install multer --workspace=apps/server && npm install --save-dev @types/multer --workspace=apps/server`

Mount in `app.ts`: `apiRouter.use('/files', fileRouter)`

### 11. ChatService changes (`services/chat-service.ts`)

Extend `StreamChatRequest` (in `services/interfaces/chat-service.interface.ts`):
```ts
export interface StreamChatRequest {
  conversationId: string;
  content: string;
  fileId?: string;           // ← ADD
  signal?: AbortSignal;
  onChunk: (content: string) => void;
}
```

Add `IFileRepository` injection to `ChatService` constructor.

In `buildInputHistory`, if `fileId` is present, load `extractedText` and prepend a context block to the user message:

```ts
private buildFileContext(extractedText: string, filename: string): string {
  return `[Attached file: ${filename}]\n\n${extractedText}\n\n---\nUser message:`;
}
```

The final user message sent to the AI becomes:
```
[Attached file: document.pdf]

<extracted text>

---
User message:
<user's typed message>
```

This does not require a model upgrade — extracted text is passed as a regular text message to `gpt-4o-mini`.

### 12. WS handler (`server.ts`)

Update the `chat:send` handler to pass `fileId` if present in the payload:

```ts
const result = await chatService.streamChatResponse({
  conversationId: parsed.data.payload.conversationId,
  content: parsed.data.payload.content,
  fileId: parsed.data.payload.fileId,    // ← ADD
  signal: abortController.signal,
  onChunk: (content) => { ... },
});
```

---

## Security

- **File size limit**: 10 MB enforced at the multer level.
- **MIME type allowlist**: only `application/pdf` and `text/plain` — validated against `ALLOWED_MIME_TYPES` constant.
- **No file system writes**: files are kept in memory during processing (multer `memoryStorage`), then only extracted text is stored in DB — raw file bytes are never persisted.
- **Extracted text length cap**: before injecting into LLM context, truncate extracted text to `MAX_FILE_CONTEXT_CHARS = 20_000` characters to prevent context flooding / excessive token spend.
- **Filename sanitisation**: never use the original filename in file system paths; only stored as metadata in DB.
- **No SSRF**: files are processed locally, never fetched from URLs.

---

## Acceptance Criteria

- [ ] `POST /api/v1/files` accepts `multipart/form-data` with a `file` field and optional `conversationId`
- [ ] Returns `{ fileId, filename }` on success
- [ ] Returns `400` if no file provided, `415` if MIME type not in allowlist, `413` if size exceeds 10 MB
- [ ] Extracted text is stored in `file_attachments` table (not raw bytes)
- [ ] `chat:send` WS message accepts optional `fileId`
- [ ] When `fileId` is provided, ChatService prepends extracted text as context to the AI request
- [ ] Extracted text is capped at `MAX_FILE_CONTEXT_CHARS` before sending to AI
- [ ] No TypeScript errors (`strict: true`)
- [ ] All new files export from their barrel `index.ts`
- [ ] Prisma migration created and applied cleanly
