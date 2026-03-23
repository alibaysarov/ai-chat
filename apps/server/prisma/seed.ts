import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Use upsert with deterministic where clauses so seeding is idempotent
  // Example:
  // await prisma.user.upsert({
  //   where: { email: 'seed@example.com' },
  //   update: {},
  //   create: { email: 'seed@example.com', name: 'Seed User' },
  // });

  console.log('Seeding complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
