# Backend Service Split & Typed Error Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/lib/services/incident.service.ts` into cohesive acyclic service modules (`incident-errors.ts`, `incident-shared.ts`, `root-cause.service.ts`, `incident-attachment.service.ts`, `incident-analytics.service.ts`), replace string-matched HTTP error mapping with `IncidentServiceError`, and ignore `.worktrees/**` & `**/.next/**` in ESLint.

**Architecture:** Maintain a strict DAG (`incident-errors` ← `incident-shared` ← `root-cause` / `incident-attachment` / `incident-analytics` ← `incident.service`). `IncidentService` exposes thin static forwarders for extracted methods so all existing test suites and `src/mcp/server.ts` keep passing unchanged while API routes adopt the dedicated services and `instanceof IncidentServiceError`.

**Tech Stack:** Next.js 16, TypeScript, Prisma ORM, Node `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-22-backend-service-split-design.md`

## Global Constraints
- Must NOT introduce circular imports between service modules.
- Must NOT rewrite `getAnalyticsData()` into SQL `GROUP BY` / raw SQL (preserve exact JS aggregation semantics).
- Must NOT alter existing HTTP status codes (`400`, `404`, `500`), JSON payload shapes, or validation messages.
- Must keep `IncidentService.*` static API compatible for existing `src/mcp/server.ts` and `tests/*.test.ts` callers.

## Review Focus
- `RootCauseService.addRootCauseOption` duplicate error (`already exists`): `/api/root-causes` previously returned HTTP `400` (`msg.includes('already exists') ? 400 : 500`) — `IncidentServiceError(..., 400)` must preserve `400`, not `409` or `500`.
- `Referenced incident not found` in `IncidentService.updateIncident`: previously mapped to HTTP `400` in `/api/incidents/[id]` (distinct from `Incident not found` which returns `404`) — `IncidentServiceError(..., 400)` must preserve `400`.
- `IncidentAttachmentService.addAttachment` and `deleteAttachment`: must NOT import `IncidentService` (would create a cycle with `createIncident`); both must use `findIncidentByIdOrTicketNo` from `incident-shared.ts`.
- Unhandled/unexpected Prisma or runtime errors (not `IncidentServiceError`): routes must continue returning HTTP `500` rather than accidentally catching `Error` as `400`.
- `eslint.config.mjs`: `.worktrees/**` and `**/.next/**` must be ignored so running `npm run lint` with an active worktree containing a `.next` build returns `0` errors.

---

### Task 1: ESLint Worktree Ignore, `IncidentServiceError`, `incident-shared.ts`, and `RootCauseService`

**Files:**
- Modify: `eslint.config.mjs`
- Create: `src/lib/services/incident-errors.ts`
- Create: `src/lib/services/incident-shared.ts`
- Create: `src/lib/services/root-cause.service.ts`
- Test: `tests/incident-analytics-export.test.ts`

**Interfaces:**
- Produces from `src/lib/services/incident-errors.ts`:
  - `export class IncidentServiceError extends Error { constructor(message: string, public status: number = 400) }` (sets `this.name = 'IncidentServiceError'`).
- Produces from `src/lib/services/incident-shared.ts`:
  - `export const RELATED_SUMMARY_SELECT`
  - `export function normalizeDepartment(raw?: string | null): string | null`
  - `export function parseRelatedTickets(raw?: string | null): string[]`
  - `export function buildFilterWhere(query: { search?: string; status?: string; urgency?: string; category?: string; rootCause?: string; department?: string; resolutionType?: string; startDate?: string; endDate?: string }): any`
  - `export async function findIncidentByIdOrTicketNo(idOrTicketNo: string): Promise<any | null>` (2-step exact ID/ticketNo + padded suffix fallback with `attachments: true, categoryRel: true`).
- Produces from `src/lib/services/root-cause.service.ts`:
  - `export class RootCauseService` with `getRootCauseOptions(): Promise<string[]>`, `addRootCauseOption(name: string): Promise<string[]>`, `deleteRootCauseOption(name: string): Promise<string[]>` throwing `IncidentServiceError(..., 400)` on validation/duplicate/last-option failures.

- [ ] **Step 1: Update `eslint.config.mjs` ignores**
Add `**/.next/**` and `.worktrees/**` to the `ignores` array in `eslint.config.mjs`.

- [ ] **Step 2: Write unit tests for `IncidentServiceError` & `RootCauseService` in `tests/incident-analytics-export.test.ts`**
Add focused assertions testing that:
1. `new IncidentServiceError('missing', 404)` is `instanceof Error` and `instanceof IncidentServiceError` with `.status === 404` and default `.status === 400`.
2. `RootCauseService.addRootCauseOption('   ')`, duplicate `addRootCauseOption`, and deleting the last remaining root cause option all throw `IncidentServiceError` with `status === 400` (clean up any temporary test option).

- [ ] **Step 3: Run test to verify it fails**
Run: `npx tsx --test tests/incident-analytics-export.test.ts`
Expected: FAIL because `incident-errors.ts` and `root-cause.service.ts` do not exist yet.

- [ ] **Step 4: Implement `incident-errors.ts`, `incident-shared.ts`, and `root-cause.service.ts`**
Extract `normalizeDepartment`, `parseRelatedTickets`, `buildFilterWhere`, `RELATED_SUMMARY_SELECT`, and `findIncidentByIdOrTicketNo` verbatim in behavior from `incident.service.ts` into `incident-shared.ts`, implement `IncidentServiceError`, and implement `RootCauseService` throwing `IncidentServiceError(..., 400)`.

- [ ] **Step 5: Run test and lint to verify pass**
Run: `npx tsx --test tests/incident-analytics-export.test.ts` and `npm run lint`
Expected: PASS (`0` lint errors).

- [ ] **Step 6: Commit**
```bash
git add eslint.config.mjs src/lib/services/incident-errors.ts src/lib/services/incident-shared.ts src/lib/services/root-cause.service.ts tests/incident-analytics-export.test.ts
git commit -m "refactor(services): extract incident errors, shared helpers, and root-cause service"
```

---

### Task 2: Extract `IncidentAttachmentService` and `IncidentAnalyticsService`

**Files:**
- Create: `src/lib/services/incident-attachment.service.ts`
- Create: `src/lib/services/incident-analytics.service.ts`
- Test: `tests/uploads-route.test.ts`, `tests/incident-analytics-export.test.ts`

**Interfaces:**
- Consumes: `IncidentServiceError` (`./incident-errors`), `findIncidentByIdOrTicketNo`, `normalizeDepartment`, `buildFilterWhere` (`./incident-shared`), `RootCauseService` (`./root-cause.service`).
- Produces from `src/lib/services/incident-attachment.service.ts`:
  - `export class IncidentAttachmentService` with `getUploadsRoot(): string`, `saveUploadedFile(file, options?)`, `addAttachment(idOrTicketNo, file, kind?)`, `deleteAttachment(idOrTicketNo, attachmentId)` — throws `IncidentServiceError(..., 404)` for missing incident/attachment and `IncidentServiceError(..., 400)` for closed-ticket mutation attempts.
- Produces from `src/lib/services/incident-analytics.service.ts`:
  - `export class IncidentAnalyticsService` with `groupDepartments`, `getDepartments(query?: string)`, `getMttrExcludedIds()`, `setMttrExcluded(incidentId, excluded)`, `getAnalyticsData(query)`.

- [ ] **Step 1: Add unit test assertions for `IncidentAttachmentService` typed `IncidentServiceError` statuses (`404` / `400`) and `IncidentAnalyticsService.getDepartments` / `getAnalyticsData` in `tests/uploads-route.test.ts` or `tests/incident-analytics-export.test.ts`**
Assert `addAttachment('INC-MISSING-9999', ...)` rejects with `err instanceof IncidentServiceError && err.status === 404`, and `IncidentAnalyticsService.getDepartments()` matches `IncidentService.getDepartments()`.

- [ ] **Step 2: Run focused tests to verify RED failure**
Run: `npx tsx --test tests/uploads-route.test.ts`
Expected: FAIL because `incident-attachment.service.ts` / `incident-analytics.service.ts` do not exist yet.

- [ ] **Step 3: Implement `incident-attachment.service.ts` and `incident-analytics.service.ts`**
Move the exact logic from `incident.service.ts` with zero circular dependency on `incident.service.ts`, using `IncidentServiceError` with `404` for missing incident/attachment and `400` for closed-incident guard.

- [ ] **Step 4: Run focused tests to verify pass**
Run: `npx tsx --test tests/uploads-route.test.ts tests/incident-analytics-export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/services/incident-attachment.service.ts src/lib/services/incident-analytics.service.ts tests/uploads-route.test.ts tests/incident-analytics-export.test.ts
git commit -m "refactor(services): extract incident attachment and analytics services"
```

---

### Task 3: Slim `IncidentService`, Migrate Route Error Handling to `IncidentServiceError`, and Full Verification

**Files:**
- Modify: `src/lib/services/incident.service.ts`
- Modify: `src/app/api/incidents/[id]/route.ts`
- Modify: `src/app/api/incidents/[id]/attachments/route.ts`
- Modify: `src/app/api/root-causes/route.ts`
- Modify: `src/app/api/incidents/analytics/route.ts`
- Modify: `src/app/api/departments/route.ts`
- Modify: `src/app/api/incidents/export/route.ts`
- Test: `tests/incident-analytics-export.test.ts`

**Interfaces:**
- Consumes: `IncidentServiceError`, `incident-shared`, `RootCauseService`, `IncidentAttachmentService`, `IncidentAnalyticsService`.
- Keeps static forwarders on `IncidentService` (`normalizeDepartment`, `getDepartments`, `parseRelatedTickets`, `getRootCauseOptions`, `addRootCauseOption`, `deleteRootCauseOption`, `getMttrExcludedIds`, `setMttrExcluded`, `getUploadsRoot`, `saveUploadedFile`, `addAttachment`, `deleteAttachment`, `buildFilterWhere`, `getAnalyticsData`) so all existing test suites and `src/mcp/server.ts` stay untouched and compatible.

- [ ] **Step 1: Add regression test asserting `IncidentService.updateIncident` throws `IncidentServiceError` with `status === 404` (missing ticket) and `status === 400` (closed lock / invalid dates / missing referenced ticket)**
Add test assertions in `tests/incident-analytics-export.test.ts`.

- [ ] **Step 2: Run focused test to verify RED (`err instanceof IncidentServiceError` fails before `incident.service.ts` throws `IncidentServiceError`)**
Run: `npx tsx --test tests/incident-analytics-export.test.ts`
Expected: FAIL on `err instanceof IncidentServiceError`.

- [ ] **Step 3: Refactor `src/lib/services/incident.service.ts` and update API routes**
- In `src/lib/services/incident.service.ts`:
  - Replace inline extracted bodies with calls/static forwarders to `incident-shared`, `RootCauseService`, `IncidentAttachmentService`, and `IncidentAnalyticsService`.
  - Throw `IncidentServiceError` in `updateIncident` (`404` for `Incident not found`, `400` for closed lock, validation, timestamp bounds, and `Referenced incident not found`).
  - Re-export `IncidentServiceError` for convenience.
- In `src/app/api/incidents/[id]/route.ts`, `src/app/api/incidents/[id]/attachments/route.ts`, and `src/app/api/root-causes/route.ts`:
  - Replace string-matching `if (msg.includes(...))` error handlers with `if (error instanceof IncidentServiceError) return NextResponse.json({ error: error.message }, { status: error.status });`.
  - Update `/api/incidents/[id]/attachments`, `/api/root-causes`, `/api/incidents/analytics`, `/api/departments`, and `/api/incidents/export` to call `IncidentAttachmentService`, `RootCauseService`, `IncidentAnalyticsService`, and `buildFilterWhere`/`parseRelatedTickets` directly.

- [ ] **Step 4: Run full verification suite (`npm run lint`, `npm test`, `npm run build`)**
Run:
- `npm run lint` -> Expected: Exit 0 (`0 errors`)
- `npm test` -> Expected: All tests PASS (`0 fail`)
- `npm run build` -> Expected: Exit 0

- [ ] **Step 5: Commit**
```bash
git add src/lib/services/incident.service.ts src/app/api/incidents/[id]/route.ts src/app/api/incidents/[id]/attachments/route.ts src/app/api/root-causes/route.ts src/app/api/incidents/analytics/route.ts src/app/api/departments/route.ts src/app/api/incidents/export/route.ts tests/incident-analytics-export.test.ts
git commit -m "refactor(services): slim IncidentService and adopt typed IncidentServiceError in routes"
```
