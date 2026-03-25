import { z } from 'zod';

export const mcpProviderSchema = z.enum(['n8n', 'zapier']);

export const wsToolCallEventSchema = z.object({
  type: z.literal('chat:tool_call'),
  toolName: z.string(),
  args: z.record(z.unknown()),
  messageId: z.string(),
  provider: mcpProviderSchema,
});

export const wsToolResultEventSchema = z.object({
  type: z.literal('chat:tool_result'),
  toolName: z.string(),
  result: z.string(),
  ok: z.boolean(),
  messageId: z.string(),
  provider: mcpProviderSchema,
});
