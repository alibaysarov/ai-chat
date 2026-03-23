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
