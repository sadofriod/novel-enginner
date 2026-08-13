import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient, following the standard pattern to avoid exhausting
// database connections when this module is hot-reloaded in dev environments.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
