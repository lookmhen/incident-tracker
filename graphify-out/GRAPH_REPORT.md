# Graph Report - incident-tracker  (2026-11-25)

## Corpus Check
- 127 files · ~99,437 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 5, .bat 2, .example 1)

## Summary
- 750 nodes · 1974 edges · 37 communities (29 shown, 8 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 170 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f92c453b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- package.json
- IntegrationService
- next
- [id]/page.tsx
- incident.service.ts
- RootCauseService
- Module: tsconfig.json
- auth.ts
- Module: docker-compose.yml
- Module: scripts
- Module: 100% Offline Air-Gapped Arch
- Module: postcss.config.mjs
- Module: Ponytail Coding & Sign-off P
- attachments/route.ts
- IncidentService
- devDependencies
- Hierarchical Root Cause Tree (Parent > Sub-branch)
- IncidentAnalyticsService
- dependencies
- track/page.tsx
- 4. Bulk Knowledge Corpus & Vector RAG Ingestion
- IncidentAttachmentService
- Synology NFS Uploads Storage & Hierarchical Layout (A + B Hybrid)
- Workflow-Driven Incident Status (Approach A)
- IncidentServiceError
- Design Spec: Production Security Hardening (Task A)
- Short Design: Move Analytics Trend Chart into 50/50 Grid
- Short Design: Show `PENDING_CONFIRM` as Completed on Public `/track`
- Ponytail
- Manager One-Way Reviewer RBAC & Admin Page Size Selector (Approach A)
- eslint.config.mjs
- Ponytail, lazy senior dev mode
- External User Resolution Mark Implementation Plan
- seed.ts
- tailwindcss
- GET
- docker-entrypoint.sh

## God Nodes (most connected - your core abstractions)
1. `next` - 50 edges
2. `IncidentService` - 45 edges
3. `IncidentServiceError` - 36 edges
4. `checkApiAccess()` - 35 edges
5. `getActiveSession()` - 32 edges
6. `IntegrationService` - 31 edges
7. `prisma` - 28 edges
8. `RootCauseService` - 25 edges
9. `react` - 21 edges
10. `IncidentDetail` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Default Tree Structure (Stored in `IntegrationConfig` key `root_cause_options`)` --references--> `RootCauseService`  [INFERRED]
  docs/superpowers/specs/2026-11-24-root-cause-tree-design.md → src/lib/services/root-cause.service.ts
- `Task 2: Analytics, CSV Export, and CSV Import Support` --references--> `importIncidentsFromCsv()`  [INFERRED]
  docs/superpowers/plans/2026-11-23-external-user-mark.md → scripts/import-csv.ts
- `Goals, Non-Goals & Anti-Goals` --references--> `ResolutionEditorCard()`  [INFERRED]
  docs/superpowers/specs/2026-11-23-external-user-mark-design.md → src/app/admin/incidents/[id]/_components/ResolutionEditorCard.tsx
- `Goals, Non-Goals & Anti-Goals` --references--> `TriageSelectorsCard()`  [INFERRED]
  docs/superpowers/specs/2026-11-24-category-edit-and-colors-design.md → src/app/admin/incidents/[id]/_components/TriageSelectorsCard.tsx
- `Goals, Non-Goals & Anti-Goals` --references--> `TriageSelectorsCard()`  [INFERRED]
  docs/superpowers/specs/2026-11-24-root-cause-tree-design.md → src/app/admin/incidents/[id]/_components/TriageSelectorsCard.tsx

## Import Cycles
- None detected.

## Communities (37 total, 8 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.08
Nodes (25): name, prisma, seed, private, version, autoprefixer, clsx, eslint (+17 more)

### Community 1 - "IntegrationService"
Cohesion: 0.05
Nodes (52): IntegrationConfig Model (AES-256), NotificationLog Model (Audit Trail), Global Constraints, Outbound Webhook Custom Fields & Unslop Implementation Plan, Review Focus, Task 1: Shared Webhook Field Schema, Validation & Payload Builder, Task 2: IntegrationService Custom Fields Persistence, API `400` Validation & Log Resend, Task 3: Update `TeamsService` & `/api/teams/ping` (Remove Adaptive Card, Use `buildWebhookPayload`) (+44 more)

### Community 2 - "next"
Cohesion: 0.06
Nodes (35): Category Model (SQLite), nextConfig, next, AcceptInviteForm(), AdminInvitePage(), AdminLoginForm(), AdminLoginPage(), AdminUserItem (+27 more)

### Community 3 - "[id]/page.tsx"
Cohesion: 0.06
Nodes (84): Task 3: Admin UI (Detail Toggle/Badge, Admin Table & Analytics Filters), Frontend Incident Detail Component Split Implementation Plan, Global Constraints, Review Focus, Task 1: Types, Pure Helpers (`types.ts`, `utils.ts` + Unit Tests), and Shared Attachment UI (`AttachmentRow.tsx`, `AttachmentPreviewModal.tsx`, `ReportAttachmentsCard.tsx`), Task 2: Extract Header, Details, and Resolution Editor Cards (`IncidentHeaderCard.tsx`, `IncidentDetailsCard.tsx`, `ResolutionEditorCard.tsx`), Task 3: Extract Right-Column Cards (`LifecycleDurationCard.tsx`, `TriageSelectorsCard.tsx`, `RelatedIncidentsCard.tsx`, `McpPreviewAccordion.tsx`), Wire Slim `page.tsx`, and Full Verification, Exact Interfaces Shared Across Backend & UI (+76 more)

### Community 4 - "incident.service.ts"
Cohesion: 0.06
Nodes (45): Task 4: Safe SQLite Online Backup Script & Synology Setup Guide, args, backupDatabase(), BackupOptions, BackupResult, compiled, tsScript, args (+37 more)

### Community 5 - "RootCauseService"
Cohesion: 0.18
Nodes (9): Task 1: ESLint Worktree Ignore, `IncidentServiceError`, `incident-shared.ts`, and `RootCauseService`, DELETE(), dynamic, GET(), handleError(), PATCH(), POST(), revalidate (+1 more)

### Community 6 - "Module: tsconfig.json"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "auth.ts"
Cohesion: 0.06
Nodes (70): Global Constraints, Production Security Hardening (Task A) Implementation Plan, Review Focus, Task 1: Edge-Safe Constant-Time Comparison & Default Secret Warnings (`src/lib/auth.ts`, `src/lib/crypto.ts`, `src/lib/api-guard.ts`), Task 2: Protocol-Aware `Secure` Cookie & Constant-Time Passcode Check (`src/app/api/auth/admin/route.ts`), Task 3: Remove Duplicate Legacy Upload Route (`src/app/api/uploads/[filename]/route.ts`), Architecture & Scope Summary, DELETE() (+62 more)

### Community 8 - "Module: docker-compose.yml"
Cohesion: 0.20
Nodes (9): build, container_name, environment, ports, restart, volumes, services, incident-app (+1 more)

### Community 9 - "Module: scripts"
Cohesion: 0.13
Nodes (15): scripts, backup:db, build, build:scripts, db:reset, dev, import:csv, lint (+7 more)

### Community 10 - "Module: 100% Offline Air-Gapped Arch"
Cohesion: 0.40
Nodes (3): metadata, RootLayout(), Navbar()

### Community 13 - "attachments/route.ts"
Cohesion: 0.21
Nodes (20): dynamic, POST(), revalidate, dynamic, POST(), revalidate, AttachedFile, SimplePublicReportPortal() (+12 more)

### Community 14 - "IncidentService"
Cohesion: 0.15
Nodes (14): Incident Model (SQLite), Global Constraints, Review Focus, Synology NFS Uploads Storage & Hierarchical Layout Implementation Plan, Task 1: Catch-All Upload Serving Route & Rewrite (`/api/uploads/[...path]`), Task 2: Hierarchical `YYYY/MM/<ticketNo>/` Storage & Nested Delete in `IncidentService`, Task 3: Docker & Synology NFS Mount Readiness, Backend Service Split & Typed Error Mapping Implementation Plan (+6 more)

### Community 15 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, eslint, eslint-config-next, postcss, prisma, tailwindcss, tsx (+8 more)

### Community 16 - "Hierarchical Root Cause Tree (Parent > Sub-branch)"
Cohesion: 0.15
Nodes (12): Global Constraints, Manager One-Way Reviewer RBAC & Admin Page Size Selector Plan, Review Focus, Task 1: Backend RBAC One-Way Guards & `ensureSchemaColumns`, Task 2: Manager Read-Only UI & `/admin` Pagination Dropdown, Task 3: Documentation Update & Full Verification, Approaches Considered, Default Tree Structure (Stored in `IntegrationConfig` key `root_cause_options`) (+4 more)

### Community 17 - "IncidentAnalyticsService"
Cohesion: 0.27
Nodes (4): Task 2: Extract `IncidentAttachmentService` and `IncidentAnalyticsService`, Task 2: Analytics, CSV Export, and CSV Import Support, Goals & Non-Goals, IncidentAnalyticsService

### Community 18 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, clsx, lucide-react, @modelcontextprotocol/sdk, next, nodemailer, @prisma/client, react (+5 more)

### Community 19 - "track/page.tsx"
Cohesion: 0.23
Nodes (9): Global Constraints, Public Tracking `PENDING_CONFIRM` Completion Plan, Review Focus, Task 1: Tracking stage helper, API headers, and tests, TrackContent(), TrackedIncident, TrackPage(), getPublicTrackStage() (+1 more)

### Community 20 - "4. Bulk Knowledge Corpus & Vector RAG Ingestion"
Cohesion: 0.18
Nodes (10): 1. Architecture Overview, 2. MCP Realtime Connection (Stdio), 3. Agent System Prompt Template, 4. Bulk Knowledge Corpus & Vector RAG Ingestion, Available MCP Tools for Agents:, Fetching Bulk Corpus:, HTTP Ingestion Endpoint:, IncidentHub & AI Agent KM Integration Guide (+2 more)

### Community 22 - "Synology NFS Uploads Storage & Hierarchical Layout (A + B Hybrid)"
Cohesion: 0.25
Nodes (7): Approaches Considered, Constraints, Decided Behavior, Goals, Non-Goals & Anti-Goals, Intent & Why, Left to the Builder, Synology NFS Uploads Storage & Hierarchical Layout (A + B Hybrid)

### Community 23 - "Workflow-Driven Incident Status (Approach A)"
Cohesion: 0.25
Nodes (7): Approaches Considered, Constraints, Decided Behavior (UI Surface), Goals, Non-Goals & Anti-Goals, Intent & Why, Left to the Builder, Workflow-Driven Incident Status (Approach A)

### Community 24 - "IncidentServiceError"
Cohesion: 0.40
Nodes (4): Approaches Considered, Design Spec: Backend Service Split & Typed Error Mapping (Task B), Intent & Why, IncidentServiceError

### Community 25 - "Design Spec: Production Security Hardening (Task A)"
Cohesion: 0.33
Nodes (5): Approaches Considered, Constraints, Design Spec: Production Security Hardening (Task A), Goals & Non-Goals, Intent & Why

### Community 26 - "Short Design: Move Analytics Trend Chart into 50/50 Grid"
Cohesion: 0.33
Nodes (5): Approaches Considered, Goals / Non-Goals / Constraints, Intent & Why, Short Design: Move Analytics Trend Chart into 50/50 Grid, Verification Plan

### Community 27 - "Short Design: Show `PENDING_CONFIRM` as Completed on Public `/track`"
Cohesion: 0.33
Nodes (5): Approaches Considered, Goals & Non-Goals, Implementation Scope, Intent & Why, Short Design: Show `PENDING_CONFIRM` as Completed on Public `/track`

### Community 28 - "Ponytail"
Cohesion: 0.40
Nodes (4): Before you write, Levels, Ponytail, The smallest complete change

### Community 29 - "Manager One-Way Reviewer RBAC & Admin Page Size Selector (Approach A)"
Cohesion: 0.40
Nodes (4): Approaches Considered, Decided Behavior, Intent & Why, Manager One-Way Reviewer RBAC & Admin Page Size Selector (Approach A)

### Community 31 - "Ponytail, lazy senior dev mode"
Cohesion: 0.50
Nodes (3): Before you write, Ponytail, lazy senior dev mode, The smallest complete change

### Community 32 - "External User Resolution Mark Implementation Plan"
Cohesion: 0.50
Nodes (3): External User Resolution Mark Implementation Plan, Global Constraints, Review Focus

## Knowledge Gaps
- **24 isolated node(s):** `@tailwindcss/container-queries`, `@tailwindcss/forms`, `clsx`, `lucide-react`, `react-dom` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 275 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `package.json`, `IntegrationService`, `[id]/page.tsx`, `incident.service.ts`, `RootCauseService`, `auth.ts`, `Module: 100% Offline Air-Gapped Arch`, `attachments/route.ts`, `track/page.tsx`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `IncidentService` (e.g. with `Synology NFS Uploads Storage & Hierarchical Layout Implementation Plan` and `Task 2: Hierarchical `YYYY/MM/<ticketNo>/` Storage & Nested Delete in `IncidentService``) actually correct?**
  _`IncidentService` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@tailwindcss/container-queries`, `@tailwindcss/forms`, `clsx` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Why does `IncidentService` connect `IncidentService` to `External User Resolution Mark Implementation Plan`, `next`, `GET`, `incident.service.ts`, `RootCauseService`, `auth.ts`, `attachments/route.ts`, `IncidentAnalyticsService`, `IncidentAttachmentService`, `IncidentServiceError`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `IncidentServiceError` (e.g. with `Backend Service Split & Typed Error Mapping Implementation Plan` and `Review Focus`) actually correct?**
  _`IncidentServiceError` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Should `IntegrationService` be split into smaller, more focused modules?**
  _Cohesion score 0.05335628227194492 - nodes in this community are weakly interconnected._