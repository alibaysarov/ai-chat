import type { Conversation } from '@prisma/client';
import { BaseRepository } from './base.repository';
import type { IConversationRepository } from './interfaces';

export class ConversationRepository extends BaseRepository implements IConversationRepository {
  async upsert(id: string): Promise<Conversation> {
    return this.db.conversation.upsert({
      where: { id },
      update: {},
      create: { id },
    });
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.db.conversation.update({
      where: { id },
      data: { title },
    });
  }
}
