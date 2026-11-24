# Hierarchical Root Cause Tree (Parent > Sub-branch)

## Intent & Why
Prevent top-level Root Cause categories from proliferating by grouping detailed sub-causes under clean Parent buckets (`Human`, `System`, `Data`, etc.), requiring Staff to pick a specific sub-branch before closing, enabling hover/click sub-branch selection, Admin customization of both Parents and Sub-branches, and 2-level Analytics filtering/grouping.

## Default Tree Structure (Stored in `IntegrationConfig` key `root_cause_options`)
```json
[
  { "name": "Human", "children": ["User Knowledge Gap", "Security Control"] },
  { "name": "System", "children": ["Program Defect", "SAP Configuration", "Procedure Gap"] },
  { "name": "Data", "children": ["Master Data Quality", "Authorization"] }
]
```
- Backward compatibility: if existing SQLite row contains a flat `string[]` (e.g. `["Human", "System", "Data"]`), `RootCauseService` automatically upgrades known defaults (`Human`, `System`, `Data`) to include their default sub-branches and preserves any custom strings as Parent nodes (`children: []`).

## Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Store canonical path string `"<Parent> > <Sub-branch>"` in existing `Incident.rootCause` (`String?`) with zero database schema migration and seamless Excel CSV round-trip (`Root Cause` column).
  - Hovering or clicking a Parent category in `TriageSelectorsCard` expands/reveals its Sub-branches; selecting a Sub-branch saves `"<Parent> > <Sub-branch>"`.
  - Enforce sub-branch selection (`PENDING_CONFIRM` / `RESOLVED` / `CLOSED`) in both UI (`validateReadyToClose` / `missingToClose`) and Backend (`IncidentService.updateIncident` rejects bare Parent `"Human"` if that Parent has children or if no `>` sub-branch is chosen when configured Parents have branches).
  - Provide `Manage Root Causes` modal (accessible from `/admin` header next to `Manage Categories` and from the Root Cause card header) to Add, Rename (syncing existing `Incident.rootCause` values), and Delete both Parents and Sub-branches.
  - Analytics (`/admin/analytics`): 2-step cascading filter (`Root Cause: All / Parent` -> `Sub: All / Child`), where filtering by Parent matches both `Parent` and `Parent > *`; Chart 7 (`By Root Cause`) displays Parent totals with indented Sub-branch breakdown underneath each Parent.
- **Non-Goals:**
  - More than 2 hierarchy levels (Parent > Child only).
  - Allowing `>` character inside Parent or Sub-branch names (rejected with `400`).
- **Anti-Goals:**
  - Breaking Manager One-Way RBAC (`MANAGER` remains read-only on `TriageSelectorsCard` and `PATCH /api/incidents/[id]`).
  - Breaking legacy CSV imports that contain plain `"Human"` (imports cleanly; user will re-classify historical rows via CSV).

## Approaches Considered
- **Approach 1 (Picked): `"Parent > Sub-branch"` string in `Incident.rootCause` + Tree JSON in `IntegrationConfig`.**
  - Zero schema migration, zero extra CSV columns, full backward compatibility with CSV re-import and MCP context.
- **Approach 2 (Rejected): Separate `rootCauseSub` SQL column.**
  - Requires Prisma schema changes, `ensureSchemaColumns`, extra CSV export/import columns, and broader API changes.
