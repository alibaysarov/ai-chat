import type { Conversation } from '@prisma/client';

export interface IConversationRepository {
  upsert(id: string): Promise<Conversation>;
  updateTitle(id: string, title: string): Promise<void>;
}
