import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  schemaEnsured: Promise<void> | undefined;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

// Auto-add nullable/defaulted columns added after initial deploy when Docker mounts an existing SQLite file
function ensureSchemaColumns(): Promise<void> {
  if (!globalForPrisma.schemaEnsured) {
    globalForPrisma.schemaEnsured = (async () => {
      try {
        const incCols = await basePrisma.$queryRawUnsafe<Array<{ name: string }>>(
          'PRAGMA table_info("Incident")'
        );
        if (incCols.length > 0 && !incCols.some((c) => c.name === 'rootCause')) {
          await basePrisma.$executeRawUnsafe('ALTER TABLE "Incident" ADD COLUMN "rootCause" TEXT');
        }

        const attCols = await basePrisma.$queryRawUnsafe<Array<{ name: string }>>(
          'PRAGMA table_info("Attachment")'
        );
        if (attCols.length > 0 && !attCols.some((c) => c.name === 'kind')) {
          await basePrisma.$executeRawUnsafe(
            'ALTER TABLE "Attachment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT \'REPORT\''
          );
        }
      } catch (err) {
        globalForPrisma.schemaEnsured = undefined;
        console.error('SQLite schema column check failed:', err);
      }
    })();
  }
  return globalForPrisma.schemaEnsured;
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        await ensureSchemaColumns();
        return query(args);
      },
    },
  },
});

export default prisma;
