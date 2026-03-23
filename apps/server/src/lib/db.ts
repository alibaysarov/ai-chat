import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../env';

// Singleton — never instantiate PrismaClient outside this file
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const db = new PrismaClient({ adapter });
