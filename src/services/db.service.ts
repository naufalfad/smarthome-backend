import { PrismaClient } from '@prisma/client';

// Global singleton to prevent multiple Prisma Client instances within a Node.js process
declare global {
  // eslint-disable-next-line no-var
  var __prismaInstance: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prismaInstance ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (!globalThis.__prismaInstance) {
  globalThis.__prismaInstance = prisma;
}

/**
 * Cleanly disconnects the shared Prisma connection pool on process shutdown
 */
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};

export interface DbConnectionStatus {
  isConnected: boolean;
  message: string;
  latencyMs?: number;
  details?: unknown;
}

/**
 * Validates connection to PostgreSQL database through Prisma
 */
export const checkDatabaseConnection = async (): Promise<DbConnectionStatus> => {
  const start = Date.now();
  try {
    // Run simple query to test connection
    await prisma.$queryRaw`SELECT 1 as connected`;
    const latencyMs = Date.now() - start;
    return {
      isConnected: true,
      message: 'PostgreSQL database connected successfully via Prisma',
      latencyMs,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - start;
    return {
      isConnected: false,
      message: 'Failed to connect to PostgreSQL database',
      latencyMs,
      details: error?.message || 'Database connection error',
    };
  }
};

