# External User Resolution Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `External User` resolution flag so IT Staff and Managers can close off-hours/holiday tickets resolved by non-IT personnel without claiming them, automatically exclude them from MTTR, and filter/export them cleanly.

**Architecture:** Add a boolean `resolvedByExternal` (`@default(false)`) column on `Incident` in Prisma SQLite, enforce skip-claim validation and automatic `mttrExcluded` sync in `IncidentService`, expose `resolvedByExternal` filtering in `buildFilterWhere` + Analytics + CSV Export/Import, and add a compact `External User` toggle and badges across the Admin UI.

**Tech Stack:** Next.js App Router (TypeScript), Prisma (SQLite), Node native test runner (`tsx --test`), Tailwind CSS.

**Spec:** [2026-11-23-external-user-mark-design.md](file:///d:/react/incident-tracker/docs/superpowers/specs/2026-11-23-external-user-mark-design.md)

## Global Constraints

- UI toggle and badge label must be concise: `External User` (no long Thai parenthetical copy, no separate free-text external solver input).
- Existing RBAC remains intact: Staff can request `PENDING_CONFIRM`; only `MANAGER` can confirm `RESOLVED` or reopen a closed ticket.
- `Category` and `Root Cause` remain required before requesting confirmation or closing an incident.
- `resolvedByExternal` must be locked once `RESOLVED`/`CLOSED` unless reopened to `IN_PROGRESS` (or modified via CSV import).
- `resolutionType` (`PERMANENT` | `WORKAROUND`) remains independent and selectable alongside `resolvedByExternal`.

## Review Focus

- Attempting to mutate `resolvedByExternal` on a `RESOLVED`/`CLOSED` ticket via `PATCH /api/incidents/[id]` without reopening returns `400`.
- Submitting `PENDING_CONFIRM` on an unclaimed `OPEN` ticket succeeds when `resolvedByExternal: true` (with `Category` and `Root Cause`), and still rejects (`400`) when `resolvedByExternal: false`.
- Marking `resolvedByExternal: true` automatically excludes the incident from MTTR (`mttrExcluded = true`), and toggling `resolvedByExternal` back to `false` (when not `ON_HOLD` and `mttrExcluded` was not explicitly sent) restores `mttrExcluded = false`.
- Filtering by `resolvedByExternal=true` or `resolvedByExternal=false` consistently scopes `/api/incidents`, `/api/incidents/analytics`, and `/api/incidents/export`.
- Importing legacy CSVs without an `External User` header succeeds without overwriting existing `resolvedByExternal`, while CSVs with `External User = Yes` set `resolvedByExternal: true` and exclude from MTTR.

---

### Task 1: Schema, Service Logic, MTTR Auto-Exclude, and Filter Query

**Files:**
- Modify: `prisma/schema.prisma:22-47`
- Modify: `src/lib/services/incident-shared.ts:53-102`
- Modify: `src/lib/services/incident.service.ts:37-46,422-691`
- Modify: `src/app/api/incidents/route.ts:21-40`
- Modify: `src/app/api/incidents/[id]/route.ts:61-86`
- Test: `tests/external-user-mark.test.ts`

**Interfaces:**
- Produces:
  - Prisma `Incident.resolvedByExternal: boolean`
  - `IncidentFilterQuery.resolvedByExternal?: string` (`'true' | 'false' | 'ALL'`)
  - `IncidentService.updateIncident(..., data: { resolvedByExternal?: boolean; ... })`

- [ ] **Step 1: Write the failing test in `tests/external-user-mark.test.ts`**

Create `tests/external-user-mark.test.ts` testing:
1. Unclaimed `OPEN` ticket cannot move to `PENDING_CONFIRM` when `resolvedByExternal` is omitted/false (`400`).
2. Unclaimed `OPEN` ticket moves to `PENDING_CONFIRM` and `RESOLVED` when `resolvedByExternal: true` (with `Category` and `Root Cause`), sets `mttrExcluded: true`, and excludes it from `avgResolutionMins`.
3. Toggling `resolvedByExternal: false` on a non-closed, non-`ON_HOLD` ticket restores `mttrExcluded: false`.
4. Mutating `resolvedByExternal` on a `RESOLVED` ticket without reopening throws `400`.
5. `IncidentService.getIncidents({ resolvedByExternal: 'true' })` and `('false')` isolate matching records.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/external-user-mark.test.ts`
Expected: FAIL because `resolvedByExternal` field/argument does not exist yet.

- [ ] **Step 3: Update `prisma/schema.prisma` and regenerate client**

Add `resolvedByExternal Boolean @default(false)` to `model Incident` in `prisma/schema.prisma`, then run `npx prisma generate && npx prisma db push`.

- [ ] **Step 4: Update `buildFilterWhere`, `IncidentService`, and `/api/incidents` routes**

- In `src/lib/services/incident-shared.ts`: add `resolvedByExternal?: string` to `buildFilterWhere`; parse `'true'` / `'false'` (`'yes'` / `'no'`) into `where.resolvedByExternal = true | false`.
- In `src/lib/services/incident.service.ts`:
  - Add `resolvedByExternal?: string` to `IncidentFilterQuery`.
  - Add `resolvedByExternal?: boolean` to `updateIncident` DTO and include it in `hasLockedFieldMutation`.
  - In `updateIncident`: compute `effExternal = updatePayload.resolvedByExternal !== undefined ? updatePayload.resolvedByExternal : target.resolvedByExternal`. Allow `PENDING_CONFIRM` without `assignedTo` when `effExternal` is `true`.
  - Auto-sync `mttrExcluded`: if `data.mttrExcluded === undefined`: when `updatePayload.status === 'ON_HOLD'` or `updatePayload.resolvedByExternal === true`, call `setMttrExcluded(target.id, true)`; else if `updatePayload.resolvedByExternal === false && target.resolvedByExternal && (updatePayload.status ?? currentStatus) !== 'ON_HOLD'`, call `setMttrExcluded(target.id, false)`.
- In `src/app/api/incidents/route.ts` and `src/app/api/incidents/[id]/route.ts`: forward `resolvedByExternal` query param / JSON body field (validating boolean when defined in PATCH).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test tests/external-user-mark.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/services/incident-shared.ts src/lib/services/incident.service.ts src/app/api/incidents/route.ts src/app/api/incidents/[id]/route.ts tests/external-user-mark.test.ts
git commit -m "feat: add resolvedByExternal flag, skip-claim transition, and auto MTTR exclusion"
```

---

### Task 2: Analytics, CSV Export, and CSV Import Support

**Files:**
- Modify: `src/lib/services/incident-analytics.service.ts:72-108,330-354`
- Modify: `src/app/api/incidents/analytics/route.ts:14-35`
- Modify: `src/app/api/incidents/export/route.ts:21-80`
- Modify: `scripts/import-csv.ts:56-75,120-285`
- Modify: `tests/external-user-mark.test.ts`

**Interfaces:**
- Consumes: `buildFilterWhere` (`resolvedByExternal`), `Incident.resolvedByExternal`, `IncidentAnalyticsService.setMttrExcluded`
- Produces:
  - `AnalyticsData.summary.externalUserCount: number`
  - CSV column `External User` (`Yes` / `No`)

- [ ] **Step 1: Write failing tests in `tests/external-user-mark.test.ts`**

Add tests asserting:
1. `/api/incidents/analytics?resolvedByExternal=true` filters analytics summary & exposes `summary.externalUserCount`.
2. `/api/incidents/export?resolvedByExternal=true` outputs `External User` column with `Yes`/`No` and filters rows.
3. `importIncidentsFromCsv` handles legacy CSVs without `External User` column safely, and sets `resolvedByExternal = true` + `mttrExcluded = true` when `External User` is `Yes`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/external-user-mark.test.ts`
Expected: FAIL on missing `externalUserCount` and missing `External User` CSV column/import behavior.

- [ ] **Step 3: Update Analytics service/route, CSV Export, and `scripts/import-csv.ts`**

- In `IncidentAnalyticsService.getAnalyticsData`: accept `resolvedByExternal?: string`, compute `externalUserCount = records.filter((r) => Boolean(r.resolvedByExternal)).length`, return it in `summary`.
- In `src/app/api/incidents/analytics/route.ts` and `src/app/api/incidents/export/route.ts`: pass `resolvedByExternal` searchParam; add `'External User'` column (`inc.resolvedByExternal ? 'Yes' : 'No'`) in export CSV.
- In `scripts/import-csv.ts`: detect `External User` header (`['External User', 'ExternalUser', 'Resolved By External']`), parse `Yes`/`true`/`1` -> `true` and `No`/`false`/`0` -> `false` (leaving `undefined` if column absent on update, `false` on create), persist `resolvedByExternal`, and call `IncidentAnalyticsService.setMttrExcluded(saved.id, true)` when `resolvedByExternal === true` (or `false` when explicitly switched to `false` and status !== `'ON_HOLD'`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/external-user-mark.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/incident-analytics.service.ts src/app/api/incidents/analytics/route.ts src/app/api/incidents/export/route.ts scripts/import-csv.ts tests/external-user-mark.test.ts
git commit -m "feat: add External User analytics count, filter, and CSV export/import support"
```

---

### Task 3: Admin UI (Detail Toggle/Badge, Admin Table & Analytics Filters)

**Files:**
- Modify: `src/app/admin/incidents/[id]/_components/types.ts:24-52`
- Modify: `src/app/admin/incidents/[id]/page.tsx:44-50,96-112,155-167,255-275,446-515`
- Modify: `src/app/admin/incidents/[id]/_components/ResolutionEditorCard.tsx:9-70,222-270,383-425`
- Modify: `src/app/admin/incidents/[id]/_components/IncidentHeaderCard.tsx:165-193`
- Modify: `src/app/admin/incidents/[id]/_components/LifecycleDurationCard.tsx:305-325`
- Modify: `src/app/admin/page.tsx:6-22,64-75,99-115,157-160,239-248,485-516,650-665`
- Modify: `src/app/admin/analytics/page.tsx:5-16,42-95,138-148,251-270,330-341`

**Interfaces:**
- Consumes: `resolvedByExternal` field on incident JSON, `?resolvedByExternal=true|false` query param, `summary.externalUserCount`

- [ ] **Step 1: Update Incident Detail types, state, validation, and components**

- Add `resolvedByExternal?: boolean;` to `IncidentDetail` in `types.ts`.
- In `src/app/admin/incidents/[id]/page.tsx`: track `[resolvedByExternal, setResolvedByExternal]` synced from `data.resolvedByExternal`; skip Claim check in `validateReadyToClose` and `missingToClose` when `resolvedByExternal` is true; send `resolvedByExternal` in `submitResolutionUpdate`; pass `resolvedByExternal` & `setResolvedByExternal` to `ResolutionEditorCard`.
- In `ResolutionEditorCard.tsx`: render compact toggle/checkbox labeled `External User` (disabled when `isClosed`) inside the Closure Type block; relax Staff `PENDING_CONFIRM` button disabled/label state when `isClaimed || resolvedByExternal`.
- In `IncidentHeaderCard.tsx`: render `External User` badge pill next to closure/category pills when `incident.resolvedByExternal` is true.
- In `LifecycleDurationCard.tsx`: mention `External User` alongside `On Hold` when `incident.mttrExcluded && incident.resolvedByExternal` (e.g., `ไม่นำไปคำนวณค่าเฉลี่ย MTTR (External User)`).

- [ ] **Step 2: Update Admin Dashboard (`/admin`) and Analytics (`/admin/analytics`)**

- In `src/app/admin/page.tsx`: add `resolvedByExternal?: boolean` to `IncidentRecord`, add `externalFilter` (`ALL` / `true` / `false`) dropdown (`Solver: All`, `IT Team`, `External User`) wired to `/api/incidents` and `handleResetFilters`, and show `External User` badge in the Status/Badges cell (and replace `Unassigned` text cleanly or keep `Unassigned` + badge cleanly).
- In `src/app/admin/analytics/page.tsx`: add `externalUserCount?: number` to `AnalyticsData.summary`, add `externalFilter` (`ALL` / `true` / `false`) dropdown wired to `fetchAnalytics` and `getExportUrl`, and display `External User: X เคส` subtly inside the Resolved/SLA card.

- [ ] **Step 3: Type-check, build CLI scripts, and run full test suite**

Run:
```bash
npx tsc --noEmit
npm run build:scripts
npm test
```
Expected: `npx tsc --noEmit` exits 0, `npm run build:scripts` exits 0, `npm test` passes all test suites with 0 failures.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/incidents/[id]/_components/types.ts src/app/admin/incidents/[id]/page.tsx src/app/admin/incidents/[id]/_components/ResolutionEditorCard.tsx src/app/admin/incidents/[id]/_components/IncidentHeaderCard.tsx src/app/admin/incidents/[id]/_components/LifecycleDurationCard.tsx src/app/admin/page.tsx src/app/admin/analytics/page.tsx
git commit -m "feat(ui): add External User toggle, badges, and filters in admin and analytics"
```
