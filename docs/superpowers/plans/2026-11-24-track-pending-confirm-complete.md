# Public Tracking `PENDING_CONFIRM` Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `PENDING_CONFIRM` tickets as completed (Step 3 "เสร็จสิ้น" + resolution/workaround notes) on `/track` while keeping internal `PENDING_CONFIRM` workflow intact.

**Architecture:** Extract a tiny pure `getPublicTrackStage` helper in `src/lib/track-status.ts` shared by `src/app/track/page.tsx` and tests, and update `src/app/api/track/[id]/route.ts` with `force-dynamic`, `Cache-Control: no-store, no-cache, must-revalidate`, and `'Uncategorized'` fallback.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, `node:test` (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-11-24-track-pending-confirm-complete-design.md`

## Global Constraints
- Stored DB `Incident.status`, `/admin`, RBAC, Analytics, and MTTR must remain untouched for `PENDING_CONFIRM`.
- Public `/api/track/[id]` must strictly exclude `managerComment`, `contactInfo`, `assignedTo`, `rootCause`, and internal attachments.
- `ON_HOLD` and `IN_PROGRESS` remain Step 2 (`50%`) on `/track`.

## Review Focus
- `PENDING_CONFIRM` (including lowercase/whitespace variants) maps to Step 3 (`100%`) and renders `resolution` / `workaroundNote`.
- `ON_HOLD` stays Step 2 (`50%`, `'รอข้อมูลเพิ่มเติม'`) and hides resolution draft.
- `OPEN` stays Step 1 (`0%`).
- `/api/track/[id]` sends `Cache-Control: no-store` and never leaks `managerComment`.
- Uncategorized tickets return `'Uncategorized'` instead of `'General'`.

---

### Task 1: Tracking stage helper, API headers, and tests

**Files:**
- Create: `src/lib/track-status.ts`
- Modify: `src/app/api/track/[id]/route.ts:1-43`
- Modify: `src/app/track/page.tsx:30-75,160-260`
- Test: `tests/track-portal.test.ts`

- [ ] **Step 1: Write failing test (`tests/track-portal.test.ts`)** covering `getPublicTrackStage` and `GET /api/track/[id]` headers/sanitization/`Uncategorized` fallback.
- [ ] **Step 2: Run test to verify failure** (`npx tsx --test tests/track-portal.test.ts`).
- [ ] **Step 3: Implement `src/lib/track-status.ts`**, update `src/app/api/track/[id]/route.ts`, and update `src/app/track/page.tsx` (`{ cache: 'no-store' }` + `getPublicTrackStage`).
- [ ] **Step 4: Run `npx tsc --noEmit` and `npm test`** and verify all tests pass with exit code `0`.
