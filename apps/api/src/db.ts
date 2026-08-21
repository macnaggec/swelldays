import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { apiConfig } from 'server/config/env';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const pool = new Pool({ connectionString: apiConfig.databaseUrl });
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: apiConfig.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
  });

if (apiConfig.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}
