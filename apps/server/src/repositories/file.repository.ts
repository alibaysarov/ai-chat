import type { FileAttachment } from '@prisma/client';
import { BaseRepository } from './base.repository';
import type { IFileRepository } from './interfaces';

export class FileRepository extends BaseRepository implements IFileRepository {
  async create(data: {
    conversationId?: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    extractedText: string;
  }): Promise<FileAttachment> {
    return this.db.fileAttachment.create({ data });
  }

  async findById(id: string): Promise<FileAttachment | null> {
    return this.db.fileAttachment.findUnique({ where: { id } });
  }
}
