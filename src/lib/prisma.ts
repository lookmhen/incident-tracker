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
        if (incCols.length > 0) {
          const existing = new Set(incCols.map((c) => c.name));
          const missingIncCols: Array<[string, string]> = [
            ['rootCause', 'TEXT'],
            ['resolutionType', 'TEXT'],
            ['workaroundNote', 'TEXT'],
            ['resolvedBy', 'TEXT'],
            ['managerComment', 'TEXT'],
            ['relatedTickets', 'TEXT'],
          ];
          for (const [col, def] of missingIncCols) {
            if (!existing.has(col)) {
              await basePrisma.$executeRawUnsafe(`ALTER TABLE "Incident" ADD COLUMN "${col}" ${def}`);
            }
          }
        }

        const attCols = await basePrisma.$queryRawUnsafe<Array<{ name: string }>>(
          'PRAGMA table_info("Attachment")'
        );
        if (attCols.length > 0 && !attCols.some((c) => c.name === 'kind')) {
          await basePrisma.$executeRawUnsafe(
            'ALTER TABLE "Attachment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT \'REPORT\''
          );
        }

        await basePrisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "AdminUser" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "username" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "email" TEXT,
            "role" TEXT NOT NULL DEFAULT 'STAFF',
            "passwordHash" TEXT NOT NULL,
            "isActive" INTEGER NOT NULL DEFAULT 1,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await basePrisma.$executeRawUnsafe(
          'CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_username_key" ON "AdminUser"("username")'
        );
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
