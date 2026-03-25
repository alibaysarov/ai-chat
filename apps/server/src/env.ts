import { z } from 'zod';
import { loadServerEnv } from './load-env';

loadServerEnv();

const corsOriginsSchema = z.string().trim().min(1).transform((value) =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
).pipe(z.array(z.string().url()).min(1));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: corsOriginsSchema.default('http://localhost:5173'),

  // n8n MCP — optional; integration disabled when absent
  N8N_MCP_URL: z.string().url().optional(),
  N8N_MCP_API_KEY: z.string().min(1).optional(),

  // Zapier MCP — optional; integration disabled when absent
  ZAPIER_MCP_URL: z.string().url().optional(),
  ZAPIER_MCP_API_KEY: z.string().min(1).optional(),
});

export const env = schema.parse(process.env);
