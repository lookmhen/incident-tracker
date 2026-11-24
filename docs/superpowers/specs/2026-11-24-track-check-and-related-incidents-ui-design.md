# Short Design: Single Checkmark on `/track` & Related Incidents UX Upgrade

**Date:** 2026-11-24  
**Scope:** Small UI & search improvement (`/track` + `/admin/incidents/[id]`)

## Intent & Why
1. On `/track`, Step 3 ("เสร็จสิ้น") rendered `done_all` (`✓✓`) inside a compact `32px` circle, making the checkmark look doubled/overlapping. Switching to single `check` (`✓`) gives a crisp completion icon.
2. On `/admin/incidents/[id]`, `Related Incidents (อ้างอิงเคสเก่า)` sat at the bottom of the right column without search result previews or a way to open a matched ticket in a new tab before linking. Moving it directly below `IncidentDetailsCard` (above `ResolutionEditorCard`) and adding detail snippets, `resolution` search matching, and an explicit new-tab Open Link button makes referencing old fixes immediate.

## Implementation Scope
- `src/app/track/page.tsx`: Use `check` instead of `done_all` in Step 3 (`z-0` track bar).
- `src/lib/services/incident-shared.ts`: Include `{ resolution: { contains: s } }` in `buildFilterWhere` `search` `OR` array alongside `ticketNo`, `title`, `description`, `reporterName`.
- `src/app/admin/incidents/[id]/page.tsx`: Move `<RelatedIncidentsCard />` to the Left Column right below `<IncidentDetailsCard />` and above `<ResolutionEditorCard />`.
- `src/app/admin/incidents/[id]/_components/types.ts` & `RelatedIncidentsCard.tsx`:
  - Update search placeholder (`เลขเคส, หัวข้อ หรือรายละเอียดปัญหา`) and `limit=10`.
  - Show a truncated 1-line `description` snippet in dropdown search rows and add a dedicated `open_in_new` (`target="_blank" rel="noopener noreferrer"`) Open Link button on each search result row and linked item.
- Tests: Verify `IncidentService.getIncidents({ search })` matches `description` and `resolution` text in `tests/incident-analytics-export.test.ts`.
