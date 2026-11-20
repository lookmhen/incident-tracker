import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/prisma';

export interface BackupOptions {
  destDir: string;
  keepDays?: number;
}

export interface BackupResult {
  backupPath: string;
  pruned: number;
}

/**
 * Creates an atomic online backup snapshot of the SQLite database via VACUUM INTO
 * and optionally prunes backup files older than keepDays.
 */
export async function backupDatabase(options: BackupOptions): Promise<BackupResult> {
  const destDir = path.resolve(options.destDir);
  await fs.promises.mkdir(destDir, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const targetPath = path.join(destDir, `incident_${stamp}.db`);

  // Escape single quotes for SQL safety
  const escapedTarget = targetPath.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}'`);

  let pruned = 0;
  const keepDays = options.keepDays ?? 30;
  if (keepDays > 0) {
    const cutoff = Date.now() - keepDays * 86_400_000;
    const entries = await fs.promises.readdir(destDir);
    for (const file of entries) {
      if (/^incident_.*\.db$/.test(file)) {
        const full = path.join(destDir, file);
        if (full === targetPath) continue;
        try {
          const st = await fs.promises.stat(full);
          if (st.isFile() && st.mtimeMs < cutoff) {
            await fs.promises.unlink(full);
            pruned++;
          }
        } catch {
          // ignore concurrent unlink or access error
        }
      }
    }
  }

  return { backupPath: targetPath, pruned };
}

// CLI Execution
const isMain =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('backup-db.ts') ||
    process.argv[1].endsWith('backup-db.js'));

if (isMain) {
  const args = process.argv.slice(2);
  let destDir = process.env.DB_BACKUP_DIR?.trim() || path.join(process.cwd(), 'backups');
  let keepDays = 30;

  for (const arg of args) {
    if (arg.startsWith('--dest=')) {
      destDir = arg.slice('--dest='.length).trim();
    } else if (arg.startsWith('--keep-days=')) {
      const parsed = parseInt(arg.slice('--keep-days='.length), 10);
      if (!isNaN(parsed) && parsed >= 0) keepDays = parsed;
    }
  }

  backupDatabase({ destDir, keepDays })
    .then((res) => {
      console.log(`[BACKUP SUCCESS] SQLite snapshot: ${res.backupPath} (pruned: ${res.pruned})`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BACKUP FAILED]', err);
      process.exit(1);
    });
}
