import { z } from 'zod';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILE_CONTEXT_CHARS = 20_000;
export const ALLOWED_MIME_TYPES = ['application/pdf', 'text/plain'] as const;

export const fileUploadResponseSchema = z.object({
  fileId: z.string().uuid(),
  filename: z.string().min(1),
});
