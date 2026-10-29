# Graph Report - Incident  (2026-10-29)

## Corpus Check
- Corpus is ~27,636 words - fits in a single context window. You may not need a graph.

## Summary
- 255 nodes · 458 edges · 13 communities (11 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.9)
- Token cost: 2,400 input · 450 output

## Community Hubs (Navigation)
- Module: package.json
- Integrations & Notification Dispatch
- Module: next.config.ts
- Analytics & Excel Reporting
- Core Incident Management
- Category & SLA Classification
- Module: tsconfig.json
- Module: admin/route.ts
- Module: docker-compose.yml
- Module: scripts
- Module: 100% Offline Air-Gapped Arch
- Module: postcss.config.mjs
- Module: Ponytail Coding & Sign-off P

## God Nodes (most connected - your core abstractions)
1. `next` - 26 edges
2. `isAdminAuthenticated()` - 19 edges
3. `IntegrationService` - 16 edges
4. `compilerOptions` - 16 edges
5. `IncidentService` - 15 edges
6. `checkApiAccess()` - 14 edges
7. `McpService` - 11 edges
8. `TeamsService` - 11 edges
9. `react` - 10 edges
10. `scripts` - 9 edges

## Surprising Connections (you probably didn't know these)
- `100% Offline Air-Gapped Architecture` --rationale_for--> `RootLayout()`  [INFERRED]
  README.md → src/app/layout.tsx
- `Category Model (SQLite)` --references--> `CategoryService`  [EXTRACTED]
  DATA_DICTIONARY.md → src/lib/services/category.service.ts
- `NotificationLog Model (Audit Trail)` --references--> `EmailService`  [EXTRACTED]
  DATA_DICTIONARY.md → src/lib/services/email.service.ts
- `Incident Model (SQLite)` --references--> `IncidentService`  [EXTRACTED]
  DATA_DICTIONARY.md → src/lib/services/incident.service.ts
- `IntegrationConfig Model (AES-256)` --references--> `IntegrationService`  [EXTRACTED]
  DATA_DICTIONARY.md → src/lib/services/integration.service.ts

## Import Cycles
- None detected.

## Communities (13 total, 2 thin omitted)

### Community 0 - "Module: package.json"
Cohesion: 0.05
Nodes (46): dependencies, clsx@^2.1.1, lucide-react@^0.475.0, next@^15.1.7, nodemailer@^10.3.1, @prisma/client@^6.4.1, react-dom@^19.0.0, tailwind-merge@^2.6.0 (+38 more)

### Community 1 - "Integrations & Notification Dispatch"
Cohesion: 0.10
Nodes (23): IntegrationConfig Model (AES-256), NotificationLog Model (Audit Trail), POST(), GET(), POST(), PUT(), POST(), decryptSecret() (+15 more)

### Community 2 - "Module: next.config.ts"
Cohesion: 0.14
Nodes (13): nextConfig, next, Model Context Protocol (MCP v1), POST(), GET(), PATCH(), GET(), GET() (+5 more)

### Community 3 - "Analytics & Excel Reporting"
Cohesion: 0.07
Nodes (15): react@^19.0.0, react, AnalyticsData, COLORS, CategoryItem, IncidentDetail, LogEntry, McpSecuritySettings (+7 more)

### Community 4 - "Core Incident Management"
Cohesion: 0.15
Nodes (9): Incident Model (SQLite), GET(), escapeCsvCell(), GET(), GET(), POST(), CreateIncidentDTO, IncidentFilterQuery (+1 more)

### Community 5 - "Category & SLA Classification"
Cohesion: 0.14
Nodes (9): Category Model (SQLite), DELETE(), PATCH(), GET(), POST(), GET(), globalForPrisma, prisma (+1 more)

### Community 6 - "Module: tsconfig.json"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "Module: admin/route.ts"
Cohesion: 0.26
Nodes (11): GET(), POST(), ADMIN_COOKIE_NAME, createAdminSessionToken(), getAdminPasscode(), getAdminSecret(), isAdminAuthenticated(), signPayload() (+3 more)

### Community 8 - "Module: docker-compose.yml"
Cohesion: 0.20
Nodes (9): build, container_name, environment, ports, restart, volumes, services, incident-app (+1 more)

### Community 9 - "Module: scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, lint, postinstall, prisma:generate, prisma:push, prisma:seed (+1 more)

### Community 10 - "Module: 100% Offline Air-Gapped Arch"
Cohesion: 0.38
Nodes (3): metadata, RootLayout(), Navbar()

## Knowledge Gaps
- **5 isolated node(s):** `Incident Model (SQLite)`, `Category Model (SQLite)`, `IntegrationConfig Model (AES-256)`, `Model Context Protocol (MCP v1)`, `Ponytail Coding & Sign-off Protocol`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 85 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Module: next.config.ts` to `Module: package.json`, `Integrations & Notification Dispatch`, `Analytics & Excel Reporting`, `Core Incident Management`, `Category & SLA Classification`, `Module: admin/route.ts`, `Module: 100% Offline Air-Gapped Arch`?**
  _High betweenness centrality (0.414) - this node is a cross-community bridge._
- **What connects `Incident Model (SQLite)`, `Category Model (SQLite)`, `IntegrationConfig Model (AES-256)` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Module: package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.054693877551020405 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Analytics & Excel Reporting` to `Module: package.json`, `Module: 100% Offline Air-Gapped Arch`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Should `Integrations & Notification Dispatch` be split into smaller, more focused modules?**
  _Cohesion score 0.10299003322259136 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `Module: scripts` to `Module: package.json`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `Module: next.config.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14039408866995073 - nodes in this community are weakly interconnected._