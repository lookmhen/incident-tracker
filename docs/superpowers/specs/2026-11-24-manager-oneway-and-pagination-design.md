# Manager One-Way Reviewer RBAC & Admin Page Size Selector (Approach A)

## Intent & Why
Make the `MANAGER` role a strict one-way reviewer: Managers review Staff-submitted work and either approve closure (`RESOLVED`), reject back to Staff (`IN_PROGRESS` with optional comment), or reopen a closed ticket (`IN_PROGRESS`), without editing incident details, triage fields, resolution content, attachments, timestamps, or jumping statuses directly. Also add a configurable records-per-page dropdown on `/admin` alongside `"Showing X of Y records"`.

## Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Enforce in `PATCH /api/incidents/[id]` that `MANAGER` sessions can ONLY pass `{ status, managerComment }` and ONLY perform:
    - `PENDING_CONFIRM -> RESOLVED` (Approve)
    - `PENDING_CONFIRM -> IN_PROGRESS` (Reject back to Staff)
    - `RESOLVED / CLOSED -> IN_PROGRESS` (Reopen back to Staff)
    All other status jumps or field mutations by `MANAGER` return `403 Forbidden`.
  - Enforce in `POST` / `DELETE /api/incidents/[id]/attachments` that `MANAGER` sessions receive `403 Forbidden`.
  - Make all Incident Detail editing controls read-only/hidden for `MANAGER` (`IncidentHeaderCard`, `IncidentDetailsCard`, `TriageSelectorsCard`, `ReportAttachmentsCard`, `RelatedIncidentsCard`, `LifecycleDurationCard`, `ResolutionEditorCard`), showing only `Approve` / `Reject` during `PENDING_CONFIRM` and `Reopen` when closed.
  - Hide the quick `Claim` button on `/admin` for `MANAGER`.
  - Add a page-size selector (`10`, `25`, `50`, `100`) next to `Showing X of Y records` on `/admin`.
  - Also include `resolvedByExternal` in `src/lib/prisma.ts` `ensureSchemaColumns()` so Docker containers auto-add the column on startup.
  - Update `README.md`, `DATA_DICTIONARY.md`, and `spec.md`.
- **Non-Goals:**
  - Changing Staff permissions (Staff retains full investigation, triage, attachment, timestamp, MTTR, and `PENDING_CONFIRM` submission powers on non-closed tickets).
  - Restricting `x-api-key` machine integrations (`session === null`).
- **Anti-Goals:**
  - Removing `Reopen` from Manager (without `Reopen`, closed mistakes could not be sent back to Staff since Staff cannot modify closed tickets).
  - Allowing Manager's `Confirm & Mark Resolved` action to overwrite Staff's `resolution`, `resolutionType`, `workaroundNote`, or `resolvedByExternal`.

## Approaches Considered
- **Approach A (Picked): Strict One-Way Reviewer + Reopen.**
  - Manager is read-only on `OPEN`/`IN_PROGRESS`/`ON_HOLD`, can only Approve or Reject on `PENDING_CONFIRM`, and can `Reopen` on `RESOLVED`/`CLOSED`.
- **Approach B (Rejected): Remove `Reopen` too.**
  - Leaves closed tickets permanently unrecoverable via UI if Staff made a mistake that slipped past review.

## Decided Behavior
- **`PATCH /api/incidents/[id]` (`MANAGER` session):**
  - Reject with `403` if any field outside `['status', 'managerComment']` is provided.
  - Reject with `403` unless transitioning `PENDING_CONFIRM -> RESOLVED | IN_PROGRESS` or `RESOLVED | CLOSED -> IN_PROGRESS`.
  - Reject with `403` on `POST`/`DELETE /api/incidents/[id]/attachments`.
- **Incident Detail UI (`isManager`):**
  - Read-only across all info, triage, attachment, related-ticket, lifecycle/MTTR, and resolution-editor inputs.
  - During `OPEN` / `IN_PROGRESS` / `ON_HOLD`: displays read-only review notice (`รอ Staff ดำเนินการและส่งเรื่องมายัง Manager เพื่อตรวจสอบ`); Approve/Reject disabled/hidden.
  - During `PENDING_CONFIRM`: Manager can enter `managerComment` and click `ตีกลับแก้ไข (In Progress)` or `Confirm & Mark Resolved (ยืนยันปิดเคส)` (sends only `{ status, managerComment }`).
  - During `RESOLVED` / `CLOSED`: Manager can click `เปิดเคสใหม่ (Reopen)` (`IN_PROGRESS`).
- **Admin Dashboard (`/admin`):**
  - Hide `Claim` button when `currentUserRole === 'MANAGER'`.
  - Add `<select>` (`10`, `25`, `50`, `100` per page) beside `Showing X of Y records`; changing it resets `page` to `1`.
