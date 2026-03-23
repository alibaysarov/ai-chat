import type { Message, MessageRole } from '@prisma/client';
import { BaseRepository } from './base.repository';
import type { IMessageRepository } from './interfaces';

export class MessageRepository extends BaseRepository implements IMessageRepository {
  async findByConversation(conversationId: string, limit: number): Promise<Message[]> {
    return this.db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async create(data: {
    conversationId: string;
    role: MessageRole;
    content: string;
  }): Promise<Message> {
    return this.db.message.create({ data });
  }
}
