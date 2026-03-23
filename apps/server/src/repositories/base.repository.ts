import type { PrismaClient } from '@prisma/client';

export abstract class BaseRepository {
  constructor(protected readonly db: PrismaClient) {}
}
