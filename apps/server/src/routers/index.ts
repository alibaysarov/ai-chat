import { Router } from 'express';
import { fileRouter } from './file-router';

export const apiRouter = Router();

apiRouter.use('/files', fileRouter);

// Register resource routers here, e.g.:
// import { chatRouter } from './chat-router';
// apiRouter.use('/chat', chatRouter);
