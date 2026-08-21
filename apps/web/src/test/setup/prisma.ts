import { PrismaClient } from '@prisma/client'
import { DeepMockProxy } from 'vitest-mock-extended'
import { prisma } from 'server/db'

// Export a typed mock of the prisma client
// This cast is safe because the module is mocked in vitest.setup.ts
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>
