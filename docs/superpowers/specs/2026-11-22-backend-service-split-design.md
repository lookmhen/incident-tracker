# Design Spec: Backend Service Split & Typed Error Mapping (Task B)

**Date:** 2026-11-22  
**Size:** Medium refactoring  
**Status:** Approved

## Intent & Why
Split the monolithic `src/lib/services/incident.service.ts` (1,271 lines) into cohesive domain modules with an acyclic dependency graph, replace fragile `msg.includes(...)` HTTP error mapping in incident API routes with a typed `IncidentServiceError`, and prevent ESLint from scanning `.worktrees/` or nested `.next/` directories.

## Goals & Non-Goals
- **Goals:**
  1. Introduce `IncidentServiceError extends Error` (`status: number = 400`) in `src/lib/services/incident-errors.ts` (mirroring `UserServiceError`).
  2. Extract domain modules from `src/lib/services/incident.service.ts` with zero circular dependencies:
     - `src/lib/services/incident-shared.ts`: `normalizeDepartment`, `parseRelatedTickets`, `buildFilterWhere`, `findIncidentByIdOrTicketNo`, `RELATED_SUMMARY_SELECT`.
     - `src/lib/services/root-cause.service.ts`: `RootCauseService` (`getRootCauseOptions`, `addRootCauseOption`, `deleteRootCauseOption`).
     - `src/lib/services/incident-attachment.service.ts`: `IncidentAttachmentService` (`getUploadsRoot`, `saveUploadedFile`, `addAttachment`, `deleteAttachment`).
     - `src/lib/services/incident-analytics.service.ts`: `IncidentAnalyticsService` (`getDepartments`, `getMttrExcludedIds`, `setMttrExcluded`, `getAnalyticsData`, `groupDepartments`).
     - `src/lib/services/incident.service.ts`: Core incident CRUD/lifecycle + thin static forwarders preserving existing `IncidentService.*` call sites in tests and `src/mcp/server.ts`.
  3. Update API route callers (`/api/incidents/[id]`, `/api/incidents/[id]/attachments`, `/api/root-causes`, `/api/incidents/analytics`, `/api/departments`, `/api/incidents/export`) to use typed `IncidentServiceError` and dedicated services cleanly.
  4. Ignore `**/.next/**` and `.worktrees/**` in `eslint.config.mjs`.
- **Non-Goals (Explicitly Excluded):**
  - Do **not** rewrite `getAnalyticsData()` into raw SQL `GROUP BY` / aggregates (YAGNI until >10,000 rows; keep existing JS calculation semantics 100% identical).
  - Do **not** refactor frontend pages (handled separately in Task 2).
  - Do **not** alter HTTP status codes, JSON shapes, or existing validation semantics.

## Approaches Considered
1. **Acyclic Domain Split + Thin Static Facade + `IncidentServiceError` (Chosen)**
   - *Pros:* Eliminates the 1,271-line monolith and string-matched error mapping cleanly while keeping all 69 existing tests and `src/mcp/server.ts` working without risky test churn.
   - *Cons:* Adds small static forwarder methods on `IncidentService` until callers are gradually migrated (easily removable later).
2. **Direct Hard Cutover (Delete all methods from `IncidentService` and rewrite 50+ test/MCP call sites)**
   - *Rejected:* Unnecessary diff noise across 5 test files for zero functional gain.
3. **Rewrite Analytics in Raw SQL**
   - *Rejected:* High dialect-lock risk (SQLite vs future PostgreSQL) and behavior drift risk on Thai month formatting / department normalization / MTTR exclusion.
