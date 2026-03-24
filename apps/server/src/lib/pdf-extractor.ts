import pdfParse from 'pdf-parse';
import { AppError } from '../types/app-error';

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text.trim();
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return extractTextFromPdf(buffer);
    case 'text/plain':
      return buffer.toString('utf-8').trim();
    default:
      throw new AppError('UNSUPPORTED_FILE_TYPE', 415, `Unsupported MIME type: ${mimeType}`);
  }
}
