# Workflow-Driven Incident Status (Approach A)

## Intent & Why
Remove free-form manual status switching (`Status:` hover dropdown) on the Incident Detail page so incident status changes are strictly driven by explicit workflow actions. This prevents accidental stage-skipping, wrong clicks on the hover menu, and duplicate controls alongside existing workflow buttons.

## Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Replace the top-bar `Status:` dropdown with contextual workflow action buttons for every valid action (`Claim`, `On Hold`, `Resume`, Manager `Reopen`).
  - Keep existing Resolution card actions (`ส่งให้ Manager ยืนยันปิดเคส`, `ตีกลับแก้ไข (In Progress)`, `Confirm & Mark Resolved`) as the single path for confirmation and closure.
  - Fix `Assigned: ...` (Re-assign) so re-assigning a non-`OPEN` ticket updates only `assignedTo` without resetting its current status to `IN_PROGRESS`.
- **Non-Goals:**
  - No database schema changes, no removal of `CLOSED` support from Backend/Analytics/Export, and no breaking restrictions on `PATCH /api/incidents/[id]` for external callers/tests.
  - No "Unclaim back to OPEN" button (ownership changes go through Re-assign).
- **Anti-Goals:**
  - Leaving a closed ticket unrecoverable by Managers (must provide a clear Manager-only `Reopen` button).
  - Breaking `ON_HOLD` MTTR exclusion workflow (must remain easily accessible from `IN_PROGRESS`).

## Constraints
- Existing backend RBAC & validation guards stay intact: Staff cannot close or modify/reopen `RESOLVED`/`CLOSED` tickets (`403`); `PENDING_CONFIRM` requires claimed ticket + Category + Root Cause (`400`); `RESOLVED`/`CLOSED` requires Category + Root Cause (`400`).
- Existing `CLOSED` records in SQLite continue rendering and working identically to `RESOLVED` (both show Manager `Reopen`).

## Approaches Considered
- **Approach A (Picked): Remove `Status:` dropdown completely + add dedicated `On Hold / Resume` and Manager `Reopen` buttons.**
  - *Trade-off:* Cleanest UX with zero accidental manual overrides; trades off direct UI switching back to `OPEN` or setting `CLOSED` instead of `RESOLVED`.
  - *Why picked:* Matches the goal of system/workflow-driven status cleanly without duplicating UI controls.
- **Approach B (Rejected): Hide dropdown from Staff, keep full dropdown as Manager override.**
  - *Trade-off:* Gives Managers an escape hatch, but keeps hover misclick risk and dual UI paths.
- **Approach C (Rejected): Keep dropdown, filter options to valid next statuses.**
  - *Trade-off:* Minimal layout change, but hides key actions (`On Hold`, `Reopen`) inside a hover menu and still feels like manual status editing.

## Decided Behavior (UI Surface)
In `src/app/admin/incidents/[id]/page.tsx`, remove the `Status: ...` hover dropdown in the top action toolbar (the read-only status pill in the header badges remains the status indicator) and render status-driven toolbar buttons:

| Current Status | Action Toolbar Buttons (besides MCP Context) | Role Scope | Resulting Transition |
|---|---|---|---|
| `OPEN` | `Claim Ticket (รับเคส)` | Staff & Manager | `assignedTo = me`, `status = IN_PROGRESS` |
| `IN_PROGRESS` | `Assigned: ...` (re-assign only) + `พักเคส (On Hold)` | Staff & Manager | `status = ON_HOLD` (backend auto-sets `mttrExcluded = true`) |
| `ON_HOLD` | `Assigned: ...` (re-assign only) + `กลับมาทำต่อ (Resume)` | Staff & Manager | `status = IN_PROGRESS` |
| `PENDING_CONFIRM` | `Assigned: ...` (re-assign only) | Staff & Manager | Status transitions happen in Resolution card (`ตีกลับแก้ไข` / `ยืนยันปิดเคส` for Manager) |
| `RESOLVED` / `CLOSED` | `Assigned: ...` (Manager only) + `เปิดเคสใหม่ (Reopen)` | Manager only (`confirm()` dialog) | `status = IN_PROGRESS` (backend clears `closedAt`) |

Additional UI adjustments:
- Update the closed-ticket helper line under the Resolution card from `"ให้เปลี่ยนสถานะกลับจากปุ่ม Status ด้านบน"` to reference the `"เปิดเคสใหม่ (Reopen)"` button.
- Re-assign button (`Assigned: ...`) on non-`OPEN` tickets sends `{ assignedTo }` only (no `status: 'IN_PROGRESS'` override).

## Left to the Builder
- Exact button Tailwind styles, icons (`pause_circle`, `play_arrow`, `lock_open`), and confirm dialog Thai copy.
- Loading/disabled state handling (`updatingStatus` or reusing existing handler guards) to prevent double clicks on `On Hold`, `Resume`, and `Reopen`.
- Verification via `npx tsc --noEmit` and `npm test` (confirming all existing tests pass without regressions).
