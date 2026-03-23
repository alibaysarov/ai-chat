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
