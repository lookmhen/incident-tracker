# Synology NFS Uploads Storage & Hierarchical Layout (A + B Hybrid)

## Intent & Why
Store uploaded incident images directly on a Synology NAS via NFS so existing Synology Snapshot / Hyper Backup protects attachments automatically, while organizing new uploads into `YYYY/MM/<ticketNo>/` folders so NFS stays fast at scale and files are human-browsable in Synology File Station—without breaking any legacy flat-stored uploads or risking SQLite corruption on NFS.

## Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Keep `docker-compose.yml` mounting a configurable host/NFS path (`${UPLOADS_VOLUME:-./public/uploads}:/app/public/uploads`) so local dev works identically and production points directly to Synology NFS.
  - Organize all **new** uploads under `YYYY/MM/<ticketNo>/<kind>_<timestamp>_<safeName>` (e.g. `2026/11/INC-202611-001/report_1763612000000_err.png`).
  - Support reading and deleting **both** legacy flat paths (`/uploads/1763...png`) and nested paths (`/uploads/2026/11/INC-202611-001/...`) via a catch-all `/api/uploads/[...path]` route with strict path-traversal protection.
  - Remove recursive `chown -R` / `chmod -R` on `/app/public/uploads` in `docker-entrypoint.sh` so container startup never stalls over NFS.
  - Provide a lightweight safe SQLite backup script (`scripts/backup-db.mjs` or shell doc) using SQLite `VACUUM INTO` to copy `data/incident.db` safely to a Synology NFS backup folder while keeping the live DB on local disk.
- **Non-Goals:**
  - No live SQLite database on NFS (SQLite WAL on NFS risks corruption).
  - No forced migration of existing flat files (they remain 100% readable & deletable in place).
  - No image re-encoding / Sharp pipeline changes.
- **Anti-Goals:**
  - Breaking any existing `/uploads/<filename>` URLs in DB or emails.
  - Breaking path-traversal or dotfile security guards in `/api/uploads/...` or `deleteAttachment()`.

## Constraints
- Next.js `standalone` mode serves runtime uploads through `next.config.ts` rewrite (`/uploads/:path*` → `/api/uploads/:path*`).
- `IncidentService.createIncident()` must generate `ticketNo` (or pass `ticketNo` after create / save with `ticketNo`) cleanly without leaving orphaned files if a `P2002` retry occurs: create incident first (or attach after `ticketNo` is finalized) so the file lands directly inside `YYYY/MM/<ticketNo>/`.
- Container runs as `nextjs` (`UID 1001`, `GID 1001`); Synology NFS export should map/allow write for UID `1001` (or `Squash: Map all users to admin` / matching UID).
- Existing tests in `tests/uploads-serving.test.ts` and `tests/incident-analytics-export.test.ts` must pass alongside new nested-path tests.

## Approaches Considered
- **Approach A + B Hybrid (Picked):** Mount Synology NFS directly into `/app/public/uploads` (via `UPLOADS_VOLUME`) + organize new uploads into `YYYY/MM/<ticketNo>/` + keep legacy flat files working + keep SQLite local with safe backup script to NFS.
  - *Trade-off:* Requires tiny route change (`[filename]` → `[...path]`) and one cron line on host for DB backup; zero migration risk and fast NFS performance long-term.
- **Approach B only (Rejected):** Mount NFS directly with flat folder only — slows down NFS `readdir` over time and impossible to browse by ticket in Synology File Station.
- **Approach C (Rejected):** Move DB to PostgreSQL/MariaDB on Synology — unnecessary operational overhead for current scale.

## Decided Behavior
1. **Upload path structure:** `saveUploadedFile(file, { ticketNo, kind, date })` writes to `<uploadRoot>/<YYYY>/<MM>/<ticketNo>/<kind>_<Date.now()>_<safeName>` when `ticketNo` is provided (or `<YYYY>/<MM>/<timestamp>_<safeName>` fallback), returning `fileUrl: '/uploads/YYYY/MM/INC-YYYYMM-XXX/...'`.
2. **Create Incident order:** `createIncident()` creates the `Incident` row first (inside the `P2002` retry loop) to lock in `ticketNo`, then writes the optional attachment directly into `YYYY/MM/<ticketNo>/` and creates the `Attachment` row.
3. **Delete Attachment:** Resolves the relative path under `public/uploads` (supporting both flat `/uploads/foo.png` and nested `/uploads/2026/11/INC-.../foo.png`) with `path.resolve` prefix guard (`filePath.startsWith(uploadDir + path.sep)`).
4. **Serving route & rewrite:**
   - Replace `src/app/api/uploads/[filename]/route.ts` with `src/app/api/uploads/[...path]/route.ts` validating every path segment (reject empty, `.` / hidden segments, `..`, backslashes, null bytes) and verifying `filePath.startsWith(uploadDir + path.sep)`.
   - Update `next.config.ts` rewrite from `/uploads/:filename` → `/uploads/:path*` to `/api/uploads/:path*`.
5. **Docker & Synology NFS readiness:**
   - `docker-compose.yml`: `${UPLOADS_VOLUME:-./public/uploads}:/app/public/uploads`
   - `docker-entrypoint.sh`: keep `chown -R` on `/app/data` only; avoid recursive `chown -R`/`chmod -R` over `/app/public/uploads`.
   - Add `scripts/backup-db.ts` (uses SQLite `VACUUM INTO` via Prisma `$executeRawUnsafe` or `sqlite3`, writing a consistent point-in-time snapshot `incident_YYYY-MM-DD_HHmmss.db` to target backup dir with optional retention pruning) + brief Synology NFS setup guide in `README.md`.

## Left to the Builder
- Exact unit test updates in `tests/uploads-serving.test.ts` (cover both legacy flat + nested `YYYY/MM/INC-...` serving, traversal rejection on nested segments, and `deleteAttachment` on nested paths).
- Cleaning up empty ticket directory on delete is optional (not required).
- Verification via `npx tsc --noEmit` and `npm test`.
