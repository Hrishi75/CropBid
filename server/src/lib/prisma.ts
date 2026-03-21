// =============================================================================
// Prisma Client Singleton
// =============================================================================
// WHY A SINGLETON?
// In development, hot-reloading (nodemon) re-imports files on every change.
// Without a singleton, each reload would create a NEW database connection pool.
// After 10 saves, you'd have 10 open pools and PostgreSQL would run out of
// connections. The singleton pattern ensures one client instance is reused.
//
// In production, this is even more critical — each PrismaClient opens 5
// connections by default. A single instance keeps connection count predictable.
// =============================================================================

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config';

// Store the singleton on the global object to survive hot-reloads
const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  return new PrismaClient({ adapter } as any);
}

// Reuse existing client or create a new one
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// In development, save the client to the global object
if (config.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}
