import type { Message, MessageRole } from '@prisma/client';

export interface IMessageRepository {
  findByConversation(conversationId: string, limit: number): Promise<Message[]>;
  create(data: { conversationId: string; role: MessageRole; content: string }): Promise<Message>;
}
