# External User Resolution Mark (Approach 1)

## Intent & Why
Allow IT Staff and Managers to mark holiday or off-hours incidents that were already resolved on-site by non-IT personnel (e.g., Production Supervisor) as **`External User`**, so IT can close these tickets retroactively without claiming them and without skewing IT team MTTR metrics.

## Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Add `resolvedByExternal Boolean @default(false)` on `Incident`.
  - Add a compact **`External User`** toggle in `ResolutionEditorCard` (alongside `Permanent` / `Workaround`), keeping the label short as `External User`.
  - Skip the mandatory `Claim Ticket` (`assignedTo` / non-`OPEN`) gate when `resolvedByExternal` is `true` across both UI validation and backend `PENDING_CONFIRM` / closure transitions.
  - Auto-exclude `External User` tickets from MTTR (`mttrExcluded = true`), reusing the existing `IntegrationConfig` (`mttr_excluded_tickets`) mechanism.
  - Display an **`External User`** badge on the incident detail header, admin dashboard table, and lifecycle card.
  - Add a simple filter (`All` / `IT Team` / `External User`) to the Admin dashboard, Analytics page, and API/CSV export, plus an `External User` summary count in Analytics and an `External User` column in CSV Export/Import (`scripts/import-csv.ts`).
- **Non-Goals:**
  - No external user login, permissions, or self-service closure UI (IT continues closing tickets in `/admin`).
  - No separate free-text input for external solver name/department (details can be noted in `Resolution Notes` when needed).
- **Anti-Goals:**
  - Replacing `resolutionType` (`PERMANENT` | `WORKAROUND`), because an external fix may still be temporary and require IT follow-up.
  - Writing `"External User"` into `assignedTo` and mixing flags with IT staff names.

## Constraints
- Existing RBAC remains unchanged: Staff submits `PENDING_CONFIRM`; only Manager confirms `RESOLVED` or reopens a closed ticket.
- `Category` and `Root Cause` remain required before requesting confirmation or closing an incident.
- Closed-ticket immutability applies to `resolvedByExternal` as well (locked once `RESOLVED`/`CLOSED` until Manager reopens to `IN_PROGRESS`).

## Approaches Considered
- **Approach 1 (Picked): Dedicated `resolvedByExternal` boolean flag on `Incident`.**
  - *Trade-off:* Adds 1 column to Prisma schema and CSV export/import, while cleanly keeping `PERMANENT` / `WORKAROUND` intact and keeping `assignedTo` clean.
  - *Why picked:* Preserves whether an external holiday fix was permanent or a workaround, and supports straightforward filtering and MTTR exclusion.
- **Approach 2 (Rejected): 3rd `resolutionType` value (`EXTERNAL_USER`).**
  - *Trade-off:* Zero schema migration, but cannot distinguish permanent vs workaround fixes made by external personnel.
- **Approach 3 (Rejected): Overload `assignedTo = "External User"`.**
  - *Trade-off:* Conflicts with Claim/Assign buttons and pollutes IT staff assignment lists.

## Decided Behavior
- **Detail Page (`ResolutionEditorCard` & `src/app/admin/incidents/[id]/page.tsx`):**
  - Compact **`External User`** toggle in the Closure section (no extra long Thai suffix, no extra text box).
  - When toggled on, `validateReadyToClose` skips the Claim Ticket requirement (`Category` and `Root Cause` still required).
  - Sending `resolvedByExternal: true` in `PATCH /api/incidents/[id]` (draft save, `PENDING_CONFIRM`, or `RESOLVED`) skips the backend claim check and automatically sets `mttrExcluded = true` (similar to `ON_HOLD`). If `resolvedByExternal` is explicitly toggled back from `true` to `false` while not `ON_HOLD` and `mttrExcluded` was not explicitly passed, restore `mttrExcluded = false`.
- **Badges & Filtering:**
  - Show **`External User`** pill badge on `IncidentHeaderCard`, Admin dashboard table rows (`/admin`), and `LifecycleDurationCard` MTTR note.
  - Add `All` / `IT Team` / `External User` filter select on `/admin` and `/admin/analytics`, passed as `resolvedByExternal=true|false` to `/api/incidents`, `/api/incidents/analytics`, and `/api/incidents/export`.
  - Add `externalUserCount` to Analytics summary so external-resolved volume is visible at a glance.
  - Export `External User` (`Yes` / `No`) in CSV and parse it back in `scripts/import-csv.ts`.

## Left to the Builder
- Exact Tailwind pill/toggle styling, icon selection, and filter select placement.
- Unit/integration tests verifying skip-claim closure, auto-MTTR exclusion, filtering, and CSV round-trip.
