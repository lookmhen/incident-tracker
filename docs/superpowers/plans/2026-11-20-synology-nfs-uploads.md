# Synology NFS Uploads Storage & Hierarchical Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable mounting a Synology NAS NFS share directly onto `/app/public/uploads`, organize all new attachments into `YYYY/MM/<ticketNo>/` subdirectories while preserving 100% compatibility with legacy flat files, and add a safe SQLite online backup script for local `data/incident.db` to Synology.

**Architecture:** Replace the single-segment `/api/uploads/[filename]` route with a catch-all `/api/uploads/[...path]` route with per-segment traversal guards, update `IncidentService` to resolve an optional `UPLOADS_DIR` root and write new files into `YYYY/MM/<ticketNo>/<kind>_<timestamp>_<safeName>` after `ticketNo` is assigned, and keep SQLite on local disk with a `VACUUM INTO` snapshot script targeting the Synology backup path.

**Tech Stack:** Next.js 16 (App Router, Standalone Mode), TypeScript, Prisma 6 + SQLite (WAL), Pure Docker (Node 26 Alpine, `nextjs` UID/GID `1001:1001`), `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-20-synology-nfs-uploads-design.md`

## Global Constraints
- Never mount live SQLite `data/incident.db` on NFS; live DB stays on local disk (`./data:/app/data`).
- Legacy flat upload URLs (`/uploads/<timestamp>_<name>`) must remain 100% readable and deletable with zero manual migration.
- Every upload path read or delete must enforce `filePath.startsWith(uploadRoot + path.sep)` and reject empty segments, hidden dotfiles (`.`), `..`, backslashes, and null bytes.
- Container startup (`docker-entrypoint.sh`) must not run recursive `chown -R` or `chmod -R` across `/app/public/uploads` to avoid multi-minute stalls on large NFS mounts.
- Keep `npm test` (all 12 suites) and `npx tsc --noEmit -p .` green with zero regressions.

## Review Focus
- **Legacy flat file compatibility alongside nested files:** Existing DB rows with `/uploads/1763...png` must still return `200` on `GET` and unlink on `DELETE` (pinned in Task 1 & Task 2 tests).
- **Multi-segment path traversal & hidden dotfiles:** Requests like `/api/uploads/2026/../.env`, `/api/uploads/2026/.hidden/a.png`, or `/api/uploads/2026/a\\b.png` must return `400` (pinned in Task 1 test).
- **Orphaned file prevention on `P2002` ticketNo retry:** `createIncident()` must finalize `ticketNo` before writing the uploaded file to `YYYY/MM/<ticketNo>/` so a retry never writes into the wrong ticket folder (pinned in Task 2).
- **Windows vs POSIX URL separators:** `fileUrl` stored in SQLite must always use forward slashes (`/uploads/2026/11/INC-.../...`) even when running tests/dev on Windows (pinned in Task 2 test).
- **Backup target quoting & retention safety:** `scripts/backup-db.ts` must escape single quotes in `VACUUM INTO '...'`, create the destination directory if missing, and only prune files matching `incident_*.db` older than `keepDays` (pinned in Task 4 test).

---

### Task 1: Catch-All Upload Serving Route & Rewrite (`/api/uploads/[...path]`)

**Files:**
- Create: `src/app/api/uploads/[...path]/route.ts`
- Delete: `src/app/api/uploads/[filename]/route.ts`
- Modify: `next.config.ts:8-18`
- Modify: `tests/uploads-route.test.ts:1-77`

**Interfaces:**
- Produces: `GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> })` in `src/app/api/uploads/[...path]/route.ts`.
- Consumes: `process.env.UPLOADS_DIR` (optional; defaults to `path.resolve(process.cwd(), 'public', 'uploads')`).

- [x] **Step 1: Update `tests/uploads-route.test.ts` to target `[...path]` and add nested + legacy + multi-segment traversal cases**
  - Import `GET as uploadGetHandler` from `../src/app/api/uploads/[...path]/route`.
  - Update existing tests to pass `{ params: Promise.resolve({ path: relPath.split('/') }) }`.
  - Add test `serves both legacy flat uploads and nested YYYY/MM/ticketNo uploads` asserting `200`, `content-type: image/png`, and byte equality for both flat and nested paths (cleaning up created files/folders in `finally`).
  - Expand traversal test to reject `['..', '.env']`, `['2026', '..', '.env']`, `['2026', '.gitkeep']`, `['..\\\\package.json']`, and `['']` with `400`.

- [x] **Step 2: Run `npx tsx --test tests/uploads-route.test.ts` to confirm it fails before route creation**
  - Expected: FAIL (module `../src/app/api/uploads/[...path]/route` not found).

- [x] **Step 3: Create `src/app/api/uploads/[...path]/route.ts`, delete old `[filename]/route.ts`, and update `next.config.ts`**
  - Validate `segments = (await params).path`: reject if `!Array.isArray(segments) || segments.length === 0`, or any segment is empty, starts with `.`, equals `..`, or contains `/`, `\\`, `\0`.
  - Resolve `uploadDir = path.resolve(process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'public', 'uploads'))` and `filePath = path.resolve(uploadDir, ...segments)`; enforce `filePath.startsWith(uploadDir + path.sep)`.
  - Preserve existing `MIME_TYPES`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`, `Content-Disposition: attachment` for unknown extensions, and `404` on `ENOENT`.
  - Update `next.config.ts` rewrite from `/uploads/:filename` → `/api/uploads/:filename` to `/uploads/:path*` → `/api/uploads/:path*`.

- [x] **Step 4: Run `npx tsx --test tests/uploads-route.test.ts`**
  - Expected: PASS (all cases in Suite 11 pass).

- [x] **Step 5: Commit Task 1**
  - `git add next.config.ts src/app/api/uploads tests/uploads-route.test.ts`
  - `git commit -m "feat(uploads): switch serving route to catch-all path with nested traversal guards"`

---

### Task 2: Hierarchical `YYYY/MM/<ticketNo>/` Storage & Nested Delete in `IncidentService`

**Files:**
- Modify: `src/lib/services/incident.service.ts:270-355` and `src/lib/services/incident.service.ts:823-880`
- Modify: `tests/incident-analytics-export.test.ts:610-665`

**Interfaces:**
- Produces:
  - `IncidentService.getUploadsRoot(): string` (resolves `process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'public', 'uploads')`)
  - `IncidentService.saveUploadedFile(file, options?: { ticketNo?: string; kind?: 'REPORT' | 'RESOLUTION'; date?: Date }): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }>`
- Consumes: catch-all `/uploads/:path*` route from Task 1.

- [x] **Step 1: Add nested upload/delete assertions in `tests/incident-analytics-export.test.ts`**
  - In `allows admin to upload and delete REPORT vs RESOLUTION attachments separately` (lines 625–664):
    - Assert `reportAtt.fileUrl` matches `/^\/uploads\/\d{4}\/\d{2}\/INC-\d{6}-\d+\/report_\d+_/` and uses forward slashes only (no `\\`).
    - Assert `resolutionAtt.fileUrl` matches `/^\/uploads\/\d{4}\/\d{2}\/INC-\d{6}-\d+\/resolution_\d+_/`.
    - Replace `path.basename(att.fileUrl)` on line 653 with `path.join(IncidentService.getUploadsRoot(), ...att.fileUrl.replace(/^\/uploads\//, '').split('/'))` so disk existence & unlink assertions verify the real nested path.
  - Also verify deleting a legacy flat attachment (e.g. `/uploads/legacy_test.png`) still unlinks cleanly from `getUploadsRoot()`.

- [x] **Step 2: Run `npx tsx --test tests/incident-analytics-export.test.ts` to verify the new assertions fail**
  - Expected: FAIL (`fileUrl` is still flat `/uploads/<ts>_...`).

- [x] **Step 3: Implement `getUploadsRoot()`, hierarchical `saveUploadedFile()`, reordered `createIncident()`, and nested `deleteAttachment()` in `src/lib/services/incident.service.ts`**
  - `getUploadsRoot()`: returns `path.resolve(process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'public', 'uploads'))`.
  - `saveUploadedFile(file, options?)`:
    - Compute `d = options?.date ?? new Date()`, `yyyy = String(d.getFullYear())`, `mm = String(d.getMonth() + 1).padStart(2, '0')`.
    - Sanitize optional `ticketNo` (`/[^a-zA-Z0-9_-]/g` → `_`).
    - Build `relSegments = safeTicket ? [yyyy, mm, safeTicket] : [yyyy, mm]`.
    - Prefix filename with `${options.kind.toLowerCase()}_` when `options?.kind` is set (`report_...` / `resolution_...`), followed by `${Date.now()}_${safeName}`.
    - `fs.promises.mkdir(path.join(uploadRoot, ...relSegments), { recursive: true })` and write buffer.
    - Return `fileUrl: \`/uploads/${[...relSegments, uniqueFileName].join('/')}\`` (POSIX forward slashes).
  - `createIncident()`: create `Incident` first inside the `P2002` retry loop to finalize `created.ticketNo`, then if `data.file?.buffer`, call `saveUploadedFile(data.file, { ticketNo: created.ticketNo, kind: 'REPORT', date: created.createdAt })`, create the `Attachment` row, and include it on `created.attachments` before dispatching Teams/Email.
  - `addAttachment()`: pass `{ ticketNo: target.ticketNo, kind, date: target.createdAt }` to `saveUploadedFile`.
  - `deleteAttachment()`: strip leading `/uploads/`, split on `/`, validate no empty/`..`/dotfile segments, resolve `path.resolve(uploadRoot, ...segments)`, check `filePath.startsWith(uploadRoot + path.sep)`, then `unlink`.

- [x] **Step 4: Run `npx tsx --test tests/incident-analytics-export.test.ts tests/uploads-route.test.ts` and `npx tsc --noEmit -p .`**
  - Expected: PASS (all tests green, `tsc` exit 0).

- [x] **Step 5: Commit Task 2**
  - `git add src/lib/services/incident.service.ts tests/incident-analytics-export.test.ts`
  - `git commit -m "feat(uploads): organize new attachments under YYYY/MM/ticketNo with UPLOADS_DIR support"`

---

### Task 3: Docker & Synology NFS Mount Readiness

**Files:**
- Modify: `docker-compose.yml:10-20`
- Modify: `docker-entrypoint.sh:1-10`
- Modify: `.env.example` (document `UPLOADS_VOLUME` and `DB_BACKUP_DIR`)

**Interfaces:**
- Produces: Compose env var `UPLOADS_VOLUME` (default `./public/uploads`) mapped to `/app/public/uploads`; non-recursive entrypoint startup on `/app/public/uploads`.

- [x] **Step 1: Update `docker-compose.yml` volume mapping**
  - Change `- ./public/uploads:/app/public/uploads` to `- ${UPLOADS_VOLUME:-./public/uploads}:/app/public/uploads`.
  - Keep `- ./data:/app/data` strictly on local disk with an inline comment warning against live SQLite on NFS.

- [x] **Step 2: Fix `docker-entrypoint.sh` to avoid recursive `chown -R` / `chmod -R` on NFS**
  - Keep `chown -R nextjs:nodejs /app/data` and `chmod -R 775 /app/data` (local disk only).
  - For `/app/public/uploads`, run non-recursive `mkdir -p /app/public/uploads` and top-level `chown nextjs:nodejs /app/public/uploads 2>/dev/null || true` only (never `-R`).

- [x] **Step 3: Document `UPLOADS_VOLUME` (optional Synology NFS mount path) and `DB_BACKUP_DIR` in `.env.example`**
  - Keep defaults commented/safe for local dev.

- [x] **Step 4: Verify `docker compose config` (if Docker CLI available) and `git diff`**
  - Expected: valid compose YAML with `${UPLOADS_VOLUME:-./public/uploads}:/app/public/uploads` and zero recursive ops on `/app/public/uploads`.

- [x] **Step 5: Commit Task 3**
  - `git add docker-compose.yml docker-entrypoint.sh .env.example`
  - `git commit -m "chore(docker): support UPLOADS_VOLUME for Synology NFS and skip recursive chmod on uploads"`

---

### Task 4: Safe SQLite Online Backup Script & Synology Setup Guide

**Files:**
- Create: `scripts/backup-db.ts`
- Modify: `package.json` (add `"backup:db": "tsx scripts/backup-db.ts"`)
- Modify: `tests/uploads-route.test.ts` (add 1 focused test for `backupDatabase()` snapshot creation & retention pruning in a temp dir)
- Modify: `README.md` (add concise Synology NFS & DB backup subsection under Docker Deployment)

**Interfaces:**
- Produces: `backupDatabase(options: { destDir: string; keepDays?: number }): Promise<{ backupPath: string; pruned: number }>` exported from `scripts/backup-db.ts`, plus CLI entrypoint (`npm run backup:db -- --dest=/mnt/synology/db-backups --keep-days=30`).

- [x] **Step 1: Write failing test for `backupDatabase()` in `tests/uploads-route.test.ts`**
  - Create a temp directory, plant one fake old file `incident_2020-01-01_000000.db` (mtime 40 days ago) and one unrelated file `keep-me.txt` (mtime 40 days ago).
  - Call `backupDatabase({ destDir: tmpDir, keepDays: 30 })`.
  - Assert returned `backupPath` exists, has size > 0, begins with SQLite header `'SQLite format 3\0'`, old `incident_*.db` was pruned (`pruned === 1`), and unrelated `keep-me.txt` was untouched. Clean up `tmpDir` in `finally`.

- [x] **Step 2: Run `npx tsx --test tests/uploads-route.test.ts` to confirm failure**
  - Expected: FAIL (`scripts/backup-db.ts` not found).

- [x] **Step 3: Implement `scripts/backup-db.ts` and register `"backup:db"` in `package.json`**
  - Use `fs.promises.mkdir(destDir, { recursive: true })`.
  - Generate `incident_YYYY-MM-DD_HHmmss.db`, escape single quotes (`target.replace(/'/g, "''")`), and execute `await prisma.$executeRawUnsafe(\`VACUUM INTO '${escaped}'\`)` (online-safe atomic SQLite snapshot without stopping the app).
  - Prune only files matching `/^incident_.*\.db$/` in `destDir` whose `mtimeMs < Date.now() - keepDays * 86_400_000`.
  - Run CLI block only when executed directly (`require.main === module` or `import.meta.url` / `process.argv[1]` check), reading `--dest` / `DB_BACKUP_DIR` and `--keep-days` (default `30`).

- [x] **Step 4: Add concise Synology NFS + cron backup section to `README.md` and run full verification**
  - Document: Synology NFS export permission for `UID 1001` (`nextjs`), mounting to host `/mnt/synology/incident-uploads`, setting `UPLOADS_VOLUME=/mnt/synology/incident-uploads` in `.env`, and a sample host cron line for `npm run backup:db`.
  - Run `npx tsc --noEmit -p .` and full `npm test`.
  - Expected: `tsc` exit 0, all test suites pass (`fail: 0`).

- [x] **Step 5: Commit Task 4**
  - `git add scripts/backup-db.ts package.json tests/uploads-route.test.ts README.md`
  - `git commit -m "feat(backup): add online SQLite VACUUM INTO backup script and Synology NFS docs"`
