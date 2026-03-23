import { err, ok, type Result } from '@ai-chat/shared';
import type { FileUploadResponse } from '@ai-chat/shared';
import { extractText } from '../lib/pdf-extractor';
import type { IFileRepository } from '../repositories/interfaces';
import { AppError } from '../types/app-error';
import type { IFileService, UploadFileInput } from './interfaces/file-service.interface';

export class FileService implements IFileService {
  constructor(private readonly fileRepo: IFileRepository) {}

  async uploadFile(input: UploadFileInput): Promise<Result<FileUploadResponse, AppError>> {
    try {
      const extractedText = await extractText(input.buffer, input.mimeType);

      const record = await this.fileRepo.create({
        conversationId: input.conversationId,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractedText,
      });

      return ok({ fileId: record.id, filename: record.originalFilename });
    } catch (error: unknown) {
      if (error instanceof AppError) {
        return err(error);
      }
      return err(new AppError('FILE_PROCESSING_FAILED', 500, 'Failed to process the uploaded file'));
    }
  }

  async getExtractedText(fileId: string): Promise<Result<string, AppError>> {
    const record = await this.fileRepo.findById(fileId);
    if (!record) return err(new AppError('FILE_NOT_FOUND', 404));
    return ok(record.extractedText);
  }
}
