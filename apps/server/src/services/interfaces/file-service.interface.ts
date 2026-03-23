import type { Result } from '@ai-chat/shared';
import type { FileUploadResponse } from '@ai-chat/shared';
import type { AppError } from '../../types/app-error';

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
