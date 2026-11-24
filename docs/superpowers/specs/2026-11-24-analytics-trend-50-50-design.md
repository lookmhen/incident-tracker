# Short Design: Move Analytics Trend Chart into 50/50 Grid

**Date:** 2026-11-24  
**Status:** Approved & Implemented  
**Size:** Small change (UI layout refactor in 1 file)

## Intent & Why
- Chart `1. แนวโน้มเข้าใหม่ vs ปิดแล้ว` currently spans `100%` (`max-w-7xl`) above the 2-column grid in `src/app/admin/analytics/page.tsx`.
- In `รายปี` view (currently 1 bar for `2026`) and `รายเดือน` view (12 bars), a full-width container leaves excessive horizontal whitespace and inflates page height.

## Goals / Non-Goals / Constraints
- **Goal:** Place Chart 1 into the existing 2-column `50/50` grid (`grid-cols-1 lg:grid-cols-2`) and balance both columns at 3 cards each without changing calculations or API contracts.
- **Non-Goals:** No new chart metrics (deferred until multi-year or closure-mix needs arise), no backend/API changes (`src/lib/services/incident-analytics.service.ts` stays untouched).
- **Constraints:** Preserve existing `groupBy` toggles (`รายปี` / `รายเดือน` / `รายวัน`), horizontal scroll (`overflow-x-auto`) for dense daily views, mobile single-column stacking, and card numbering (`1.`–`7.`).

## Approaches Considered
1. **Approach 1 (Picked): Fold Chart 1 into the existing 2-column 50/50 grid**
   - Left column: Chart 1 (Trend), Chart 2 (Category), Chart 3 (Top Departments).
   - Right column: Chart 4 (Resolution & SLA Status), Chart 5 (MTTR Breakdown), Chart 6 (Backlog Aging).
   - Bottom full-width: Chart 7 (Root Cause Breakdown).
   - *Why picked:* Solves oversized empty space immediately with zero new backend complexity or visual noise; both columns stay balanced (3 cards each).
2. **Approach 2 (Deferred): Keep Chart 1 in a 50/50 top row and add a new chart card (Closure Type & Solver Mix or Assignee Workload)**
   - *Trade-off:* Adds new backend aggregations, UI component surface, and tests for data already visible at summary level in KPIs. Can be added cleanly later if needed.

## Verification Plan
- Run `npx tsc --noEmit` and `npm test` after layout edit.
- Inspect responsive classes (`grid-cols-1 lg:grid-cols-2`) to confirm mobile stacks cleanly (`1` -> `2` -> `3` -> `4` -> `5` -> `6` -> `7` or column-ordered cleanly).
