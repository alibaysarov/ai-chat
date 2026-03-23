import { z } from 'zod';
import { MAX_USER_MESSAGE_LENGTH } from '../constants';

export const messageRoleSchema = z.enum(['system', 'user', 'assistant']);

export const chatMessageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.coerce.date(),
});

export const chatCompletionRequestSchema = z.object({
  conversationId: z.string().min(1),
  userMessage: z.string().min(1).max(MAX_USER_MESSAGE_LENGTH),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat:send'),
    payload: z.object({
      conversationId: z.string().min(1),
      content: z.string().min(1).max(MAX_USER_MESSAGE_LENGTH),
    }),
  }),
  z.object({ type: z.literal('ping') }),
]);

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat:chunk'),
    payload: z.object({ content: z.string() }),
  }),
  z.object({ type: z.literal('chat:done') }),
  z.object({
    type: z.literal('error'),
    payload: z.object({ code: z.string(), message: z.string() }),
  }),
]);
