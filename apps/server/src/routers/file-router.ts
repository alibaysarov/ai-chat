import { Router } from 'express';
import multer from 'multer';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@ai-chat/shared';
import { db } from '../lib/db';
import { asyncHandler } from '../middleware/async-handler';
import { FileRepository } from '../repositories/file.repository';
import { FileService } from '../services/file-service';
import { AppError } from '../types/app-error';

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
    if (!req.file) {
      throw new AppError('NO_FILE_PROVIDED', 400, 'No file was provided in the request');
    }

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(req.file.mimetype)) {
      throw new AppError(
        'UNSUPPORTED_FILE_TYPE',
        415,
        `File type '${req.file.mimetype}' is not supported. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    const conversationId =
      typeof req.body.conversationId === 'string' && req.body.conversationId.length > 0
        ? req.body.conversationId
        : undefined;

    const result = await fileService.uploadFile({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      conversationId,
    });

    if (!result.ok) throw result.error;

    res.status(201).json(result.value);
  }),
);
