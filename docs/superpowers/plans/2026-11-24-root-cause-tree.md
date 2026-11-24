# Hierarchical Root Cause Tree Implementation Plan

**Goal:** Implement 2-level Root Cause (`Parent > Sub-branch`) storage in `IntegrationConfig`, mandatory sub-branch validation on closure, hover/click branch selection UI, shared `ManageRootCausesModal`, 2-level Analytics filter + grouped chart, and team crosscheck.

**Spec:** [2026-11-24-root-cause-tree-design.md](file:///d:/react/incident-tracker/docs/superpowers/specs/2026-11-24-root-cause-tree-design.md)

## Exact Interfaces Shared Across Backend & UI
- `RootCauseNode`: `{ name: string; children: string[] }`
- `GET /api/root-causes?format=tree` -> `RootCauseNode[]` (without `?format=tree`, returns flattened `string[]` of `"Parent > Child"` / childless `"Parent"` for legacy callers).
- `POST /api/root-causes`:
  - `{ action: 'add_parent', name: string }` -> `201` `RootCauseNode[]`
  - `{ action: 'add_child', parent: string, name: string }` -> `201` `RootCauseNode[]`
  - Legacy `{ name: string }` -> supports `"Parent > Child"` (adds parent if needed + child) or plain `"Name"` (adds parent).
- `PATCH /api/root-causes`:
  - `{ action: 'rename_parent', oldName: string, newName: string }` -> `200` `RootCauseNode[]`
  - `{ action: 'rename_child', parent: string, oldName: string, newName: string }` -> `200` `RootCauseNode[]`
- `DELETE /api/root-causes`:
  - `?parent=<p>&child=<c>` -> deletes sub-branch `c` from parent `p`, returns `200` `RootCauseNode[]`
  - `?parent=<p>` or `?name=<n>` -> deletes parent (or `"Parent > Child"`), returns `200` `RootCauseNode[]`
- `AnalyticsData` additions:
  - `byRootCauseGrouped`: `Array<{ parent: string; count: number; percentage: number; children: Array<{ name: string; fullPath: string; count: number; percentage: number }> }>`
  - `filterOptions.rootCauseTree`: `RootCauseNode[]` (merged configured tree + any legacy/observed values so filters never hide existing DB rows)

## Tasks
1. **Backend & Tests (Subagent 1):**
   - Update `src/lib/services/root-cause.service.ts` (tree JSON, flat-to-tree migration, validation disallowing `>`, CRUD + transactional `Incident.rootCause` rename sync).
   - Update `src/app/api/root-causes/route.ts` (`GET`, `POST`, `PATCH`, `DELETE`).
   - Update `src/lib/services/incident-shared.ts` (`buildFilterWhere` parent-prefix matching when `rootCause` has no `>`).
   - Update `src/lib/services/incident.service.ts` (validate sub-branch requirement on `PENDING_CONFIRM` / `RESOLVED` / `CLOSED` when Parent has children or when bare Parent is selected).
   - Update `src/lib/services/incident-analytics.service.ts` (`byRootCauseGrouped` + `filterOptions.rootCauseTree`).
   - Add `tests/root-cause-tree.test.ts` and update existing test assertions where needed.
2. **UI Components (Subagent 2):**
   - Create `src/components/ManageRootCausesModal.tsx`.
   - Update `src/app/admin/incidents/[id]/_components/types.ts`, `TriageSelectorsCard.tsx` (hover/click Parent -> Sub-branch pills, breadcrumb display, Manage button, read-only for `isManager`), and `page.tsx` (load `?format=tree`, enforce sub-branch in `validateReadyToClose` / `missingToClose`).
   - Update `src/app/admin/page.tsx` (`Manage Root Causes` button + modal).
   - Update `src/app/admin/analytics/page.tsx` (2-level cascading Parent -> Sub filter + grouped Chart 7).
3. **Team Crosscheck & Final Verification (Subagent 3 + Final Check):**
   - Independent crosscheck of RBAC, CSV round-trip, Analytics grouping/filtering, UI read-only states, `npx tsc --noEmit`, `npm run build:scripts`, and `npm test`.
