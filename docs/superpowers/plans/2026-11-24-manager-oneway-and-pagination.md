# Manager One-Way Reviewer RBAC & Admin Page Size Selector Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lock `MANAGER` to strict one-way review (`Approve`/`Reject` on `PENDING_CONFIRM`, `Reopen` on `RESOLVED`/`CLOSED`), add `/admin` records-per-page dropdown (`10/25/50/100`), add `resolvedByExternal` to `ensureSchemaColumns()`, and update project docs.

**Architecture:** Enforce strict role guards in `/api/incidents/[id]` and `/api/incidents/[id]/attachments`, disable/hide edit controls for `isManager` across Incident Detail components and `/admin`, and wire `limit` state into `/admin` pagination.

**Tech Stack:** Next.js App Router (TypeScript), Prisma (SQLite), Node native test runner (`tsx --test`), Tailwind CSS.

**Spec:** [2026-11-24-manager-oneway-and-pagination-design.md](file:///d:/react/incident-tracker/docs/superpowers/specs/2026-11-24-manager-oneway-and-pagination-design.md)

## Global Constraints
- `MANAGER` session can only send `{ status, managerComment }` on `PATCH /api/incidents/[id]` for `PENDING_CONFIRM -> RESOLVED | IN_PROGRESS` or `RESOLVED | CLOSED -> IN_PROGRESS`.
- `MANAGER` session gets `403` on any field edit or attachment upload/delete.
- `x-api-key` machine callers (`session === null`) remain unaffected.
- `/admin` page-size selector supports `10`, `25`, `50`, `100` and resets `page` to `1` on change.

## Review Focus
- `MANAGER` attempting `OPEN -> RESOLVED`, `IN_PROGRESS -> ON_HOLD`, or editing `title`/`category`/`resolution`/`closedAt`/`department` returns `403`.
- `MANAGER` uploading or deleting attachments returns `403`.
- `MANAGER` approving `PENDING_CONFIRM -> RESOLVED` does NOT mutate `resolution`, `resolutionType`, `workaroundNote`, or `resolvedByExternal`.
- `MANAGER` rejecting `PENDING_CONFIRM -> IN_PROGRESS` saves optional `managerComment` and leaves `closedAt: null`.
- `STAFF` cannot resolve/close (`403`) or modify/reopen closed tickets (`403`) except reporter contact metadata.

---

### Task 1: Backend RBAC One-Way Guards & `ensureSchemaColumns`

**Files:**
- Modify: `src/lib/prisma.ts:28-35`
- Modify: `src/app/api/incidents/[id]/route.ts:40-86`
- Modify: `src/app/api/incidents/[id]/attachments/route.ts:17-25,73-82`
- Modify: `tests/rbac-users-workflow.test.ts`
- Modify: `tests/external-user-mark.test.ts`
- Modify: `tests/incident-analytics-export.test.ts`

- [ ] **Step 1: Update & write failing RBAC tests (RED)**
  - In `tests/rbac-users-workflow.test.ts`: test that `MANAGER` gets `403` when editing fields (`category`, `description`, `department`, `closedAt`, `mttrExcluded`, `assignedTo`), jumping `OPEN/IN_PROGRESS -> RESOLVED` (`403`), or uploading/deleting attachments (`403`), while `PENDING_CONFIRM -> RESOLVED`, `PENDING_CONFIRM -> IN_PROGRESS` (reject with `managerComment`), and `RESOLVED -> IN_PROGRESS` (reopen) succeed `200`.
  - Update existing tests in `tests/incident-analytics-export.test.ts` and `tests/external-user-mark.test.ts` that previously assumed `MANAGER` (`createAdminSessionToken()`) performs `STAFF` mutations (use `role: 'STAFF'` for `STAFF` operations and `PENDING_CONFIRM -> RESOLVED` for `MANAGER` approval).
- [ ] **Step 2: Run tests to verify RED**
  - Run `npx tsx --test tests/rbac-users-workflow.test.ts` -> Expected FAIL (`200`/`400` instead of `403`).
- [ ] **Step 3: Implement backend RBAC guards & `ensureSchemaColumns` update**
  - Add `['resolvedByExternal', 'BOOLEAN NOT NULL DEFAULT false']` to `missingIncCols` in `src/lib/prisma.ts`.
  - Enforce strict `MANAGER` one-way guard in `src/app/api/incidents/[id]/route.ts` and `403` in `src/app/api/incidents/[id]/attachments/route.ts`.
- [ ] **Step 4: Run tests to verify GREEN**
  - Run `npx tsx --test tests/rbac-users-workflow.test.ts tests/external-user-mark.test.ts tests/incident-analytics-export.test.ts`.

---

### Task 2: Manager Read-Only UI & `/admin` Pagination Dropdown

**Files:**
- Modify: `src/app/admin/incidents/[id]/page.tsx`
- Modify: `src/app/admin/incidents/[id]/_components/IncidentHeaderCard.tsx`
- Modify: `src/app/admin/incidents/[id]/_components/IncidentDetailsCard.tsx`
- Modify: `src/app/admin/incidents/[id]/_components/TriageSelectorsCard.tsx`
- Modify: `src/app/admin/incidents/[id]/_components/ReportAttachmentsCard.tsx`
- Modify: `src/app/admin/incidents/[id]/_components/RelatedIncidentsCard.tsx`
- Modify: `src/app/admin/incidents/[id]/_components/LifecycleDurationCard.tsx`
- Modify: `src/app/admin/incidents/[id]/_components/ResolutionEditorCard.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Propagate `isManager` read-only mode to Incident Detail components**
  - Disable/hide editing controls across Header, Details, Triage, Report Attachments, Related Incidents, Lifecycle/MTTR, and Resolution Editor when `isManager` is true.
  - Update `submitResolutionUpdate` / Manager approve handler so `MANAGER` only sends `{ status: 'RESOLVED', managerComment }` on `PENDING_CONFIRM`.
  - Show read-only awaiting-Staff notice when `isManager && !isPendingConfirm && !isClosed`.
- [ ] **Step 2: Update `/admin` (`src/app/admin/page.tsx`)**
  - Track `currentUserRole` from `/api/auth/admin` and hide `Claim` button when `currentUserRole === 'MANAGER'`.
  - Add `limit` state (`10 | 25 | 50 | 100`) and `<select>` dropdown beside `Showing X of Y records`.

---

### Task 3: Documentation Update & Full Verification

**Files:**
- Modify: `README.md`
- Modify: `DATA_DICTIONARY.md`
- Modify: `spec.md`

- [ ] **Step 1: Update `README.md`, `DATA_DICTIONARY.md`, and `spec.md`**
  - Document Manager One-Way Reviewer RBAC (`PENDING_CONFIRM` Approve/Reject + closed `Reopen` only), `External User` resolution mark + auto MTTR exclusion + Solver filter, `/admin` page-size selector (`10/25/50/100`), and `resolvedByExternal` schema column.
- [ ] **Step 2: Run full verification**
  - Run `npx next typegen`, `npx tsc --noEmit`, `npm run build:scripts`, and `npm test`.
