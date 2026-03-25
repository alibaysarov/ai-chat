import type { ToolCallLog } from '@prisma/client';

export interface CreateToolCallLogInput {
  conversationId: string;
  messageId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: string | null;
  ok: boolean;
  durationMs: number;
}

export interface IToolCallLogRepository {
  create(input: CreateToolCallLogInput): Promise<ToolCallLog>;
  findByConversation(conversationId: string, limit?: number): Promise<ToolCallLog[]>;
}
