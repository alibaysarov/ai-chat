import type { PrismaClient, ToolCallLog } from '@prisma/client';
import { BaseRepository } from './base.repository';
import type {
  IToolCallLogRepository,
  CreateToolCallLogInput,
} from './interfaces/tool-call-log.repository.interface';

export class ToolCallLogRepository extends BaseRepository implements IToolCallLogRepository {
  constructor(db: PrismaClient) {
    super(db);
  }

  async create(input: CreateToolCallLogInput): Promise<ToolCallLog> {
    return this.db.toolCallLog.create({ data: input });
  }

  async findByConversation(conversationId: string, limit = 50): Promise<ToolCallLog[]> {
    return this.db.toolCallLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
