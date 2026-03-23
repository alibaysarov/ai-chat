import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { apiRouter } from './routers';
import { errorHandler } from './middleware';
import { env } from './env';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  }),
);
app.use(express.json());

app.use('/api/v1', apiRouter);

// Centralized error handler — must be registered last
app.use(errorHandler);

export default app;
