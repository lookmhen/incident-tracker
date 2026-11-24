# Short Design: Show `PENDING_CONFIRM` as Completed on Public `/track`

**Date:** 2026-11-24  
**Scope:** Small change (Public Tracking UI + Tracking API headers & unit test)

## Intent & Why
When IT Staff completes a fix and submits a ticket for Manager sign-off (`status === "PENDING_CONFIRM"`), end users can already resume work, even if Manager approval happens later. Showing Step 3 ("เสร็จสิ้น") and the resolution/workaround notes immediately on `/track` eliminates confusion while keeping internal workflow intact.

## Goals & Non-Goals
- **Goals:**
  - On `/track`, treat `PENDING_CONFIRM` as Step 3 ("เสร็จสิ้น") alongside `RESOLVED` and `CLOSED`.
  - Display the `บันทึกการแก้ไขปัญหา` card (including `Workaround` note when `resolutionType === "WORKAROUND"`) during `PENDING_CONFIRM` if `resolution` is present.
  - Ensure `/api/track/[id]` and `/track` fetch fresh state (`Cache-Control: no-store`) and use `Uncategorized` instead of `General` when uncategorized.
- **Non-Goals / Constraints:**
  - Do **not** alter the stored `Incident.status` (`PENDING_CONFIRM` remains `PENDING_CONFIRM` in SQLite, `/admin`, RBAC, Analytics, and MTTR until Manager approves or rejects).
  - Do **not** expose internal fields (`managerComment`, `contactInfo`, `assignedTo`, `rootCause`, attachments) in `/api/track/[id]`.
  - If Manager later rejects (`PENDING_CONFIRM` -> `IN_PROGRESS`), `/track` reflects Step 2 again on next lookup.
  - `ON_HOLD` stays in Step 2 ("กำลังดำเนินการ / รอข้อมูลเพิ่มเติม").

## Approaches Considered
1. **Option 1 (Chosen): Full Step 3 ("เสร็จสิ้น") + Resolution/Workaround on `/track` for `PENDING_CONFIRM`**  
   - *Pros:* Users immediately see the fix/workaround instructions and know they can continue working. Zero DB/RBAC/MTTR changes.  
   - *Trade-off:* If Manager later sends the ticket back (`IN_PROGRESS`), `/track` reverts to Step 2; Staff draft resolution is visible to the ticket holder before Manager sign-off.
2. **Option 2: Step 3 "เสร็จสิ้น" on `/track` while hiding `resolution` until `RESOLVED`/`CLOSED`**  
   - *Rejected:* Users still wouldn't see workaround conditions or fix notes needed to resume work.
3. **Option 3: Auto-close to `RESOLVED` when Staff finishes**  
   - *Rejected:* Violates Manager one-way approval workflow and RBAC rules.

## Implementation Scope
- `src/app/track/page.tsx`:
  - Treat `PENDING_CONFIRM`, `RESOLVED`, and `CLOSED` as `isCompletedForUser` (`100%` progress bar, green Step 3 "เสร็จสิ้น", render `บันทึกการแก้ไขปัญหา` + `Workaround`).
  - Keep `ON_HOLD` and `IN_PROGRESS` in Step 2 (`isInProgress`).
  - Fetch `/api/track/...` with `{ cache: 'no-store' }`.
- `src/app/api/track/[id]/route.ts`:
  - Add `export const dynamic = 'force-dynamic'; export const revalidate = 0;` and `Cache-Control: no-store, no-cache, must-revalidate` header on `GET`.
  - Use `'Uncategorized'` fallback instead of `'General'` for consistency.
- Tests: Extract/verify public tracking mapping & `/api/track/[id]` behavior for `PENDING_CONFIRM` vs `ON_HOLD` vs `RESOLVED`.
