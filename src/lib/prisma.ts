import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  rootCauseEnsured: Promise<void> | undefined;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

function ensureIncidentColumns(): Promise<void> {
  if (!globalForPrisma.rootCauseEnsured) {
    globalForPrisma.rootCauseEnsured = (async () => {
      try {
        const cols = await basePrisma.$queryRawUnsafe<Array<{ name: string }>>(
          'PRAGMA table_info("Incident")'
        );
        if (!cols.some((c) => c.name === 'rootCause')) {
          await basePrisma.$executeRawUnsafe('ALTER TABLE "Incident" ADD COLUMN "rootCause" TEXT');
        }
      } catch (err) {
        globalForPrisma.rootCauseEnsured = undefined;
        console.error('SQLite Incident column check failed:', err);
      }
    })();
  }
  return globalForPrisma.rootCauseEnsured;
}

export const prisma = basePrisma.$extends({
  query: {
    incident: {
      async $allOperations({ args, query }) {
        await ensureIncidentColumns();
        return query(args);
      },
    },
  },
});

export default prisma;
