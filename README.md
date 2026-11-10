# 📑 IncidentHub - IT Incident Management System (MCP & AI Ready)

A modern, high-reliability enterprise IT Incident Management System built with **Next.js 15 (App Router, TypeScript)**, **Tailwind CSS (Glacier Core Design System)**, **Prisma ORM**, and **SQLite**. Containerized in **Pure Docker** (Node.js 26 Alpine Base) with zero external web server dependencies (no Apache). 100% offline-capable and vendor-neutral.

---

## 🚀 Key Features

### 1. 🌟 Zero-Barrier User Portal (`/`)
* **No Authentication Required:** Instant access via direct link or QR code.
* **Auto-Cached Identity:** Remembers reporter name, department, and contact info in `localStorage`.
* **Clipboard Diagnostic Capture:** Paste screenshots directly anywhere using `Ctrl+V` or drag-and-drop up to 5MB.
* **Instant Ticket Generation:** Generates sequential IDs (`INC-YYYYMM-XXX`).
* **Multi-Channel Dispatch:** Emits Microsoft Teams Adaptive Cards v1.4 and SMTP Email notifications immediately upon submission.

### 2. 📊 IT Operations Triage Matrix (`/admin`)
* **Real-time Telemetry:** 5 Glacier metric KPI cards (Active Incidents, Critical P1 Blockers, MTTA, Teams Webhook Rate, MCP Vector Corpus).
* **Precision Search & Filtering:** Instant filter with `/` keyboard focus shortcut; filter by status, urgency, category, and department.
* **Dynamic Category Management:** Admins can create and manage ticket categories on the fly.
* **Quick Single-Click Claim:** Instant ticket claiming and status transition to `IN_PROGRESS` with responder attribution.
* **Excel (.CSV UTF-8 BOM) Export:** Filtered incident export with Thai language compatibility in Microsoft Excel.

### 3. 🧠 Incident Detail & Triage Hub (`/admin/incidents/[id]`)
* **Diagnostics Inspector:** Preview and zoom full-stack error snapshots.
* **Inline Details Editing:** Admins can edit or clarify incident title and description directly with audit feedback.
* **Clean-Text Resolution Indexer:** RCA documentation editor and sanitizer to guarantee 100% clean plain-text corpus for vector embedding.
* **Status Lifecycle Management:** Single-click transitions (`OPEN` ➔ `IN_PROGRESS` ➔ `RESOLVED` / `CLOSED`) with automatic `closedAt` timestamping for MTTR calculation.
* **MCP Knowledge Pipeline Hub:** Live JSON schema preview conforming to `mcp://incidenthub/incidents/[ticketNo]`.

### 4. 🔌 Integration Hub (`/admin/integrations`)
* **Inbound Incident API (`POST /api/incidents/inbound`):** Secure endpoint for external systems (monitoring, Nagios, Prometheus, third-party apps) with Smart Mapping and API Key authentication.
* **Microsoft Teams / Power Automate Webhook:** Live channel connectivity with interactive payload testing.
* **SMTP Email Notification Service:** Enterprise mail dispatch with encrypted credential storage in SQLite.
* **Notification Audit Logs:** Filterable dispatch history by channel (`TEAMS`, `EMAIL`, `CUSTOM_API`) and delivery status.

### 5. 📈 Analytics & Operational Intelligence (`/admin/analytics`)
* 4-dimension incident distribution graphs: Status breakdown, Urgency matrix, Category volume, and Department reporting frequency.
* **Full-Year Monthly Trend:** 12-month timeline with zero-fill for empty months, preset button "ปีนี้ (12 เดือน)", and toggle between Monthly and Daily views.

---

## 🛠 Tech Stack

* **Framework:** Next.js 15 (App Router, Standalone Mode, TypeScript)
* **Styling:** Tailwind CSS (Glacier Core palette: Sky 600, Ice Blue tints, JetBrains Mono, Google Material Symbols Outlined)
* **Database & ORM:** SQLite + Prisma ORM (`./data/incident.db`)
* **Containerization:** Pure Docker (Node.js 26 Alpine Multi-stage Build)
* **Integrations:** Microsoft Teams Incoming Webhook (Adaptive Cards v1.4), SMTP Email (Nodemailer), Inbound REST API
* **AI Readiness:** Model Context Protocol (MCP) Endpoints

---

## 🏃 Quick Start (Local Development)

### Prerequisites
* Node.js 20+ (Node.js 26 recommended)
* npm 10+

### Quick Start on Windows
Double-click [`start_dev.bat`](start_dev.bat) to automatically check dependencies, initialize the database, and launch the dev server.

### Manual Installation
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Push database schema & seed initial records
npx prisma db push
npx tsx prisma/seed.ts

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser:
* **Zero-Barrier Report:** [http://localhost:3000](http://localhost:3000)
* **Operations Triage Dashboard:** [http://localhost:3000/admin](http://localhost:3000/admin)
* **Integration Hub:** [http://localhost:3000/admin/integrations](http://localhost:3000/admin/integrations)
* **Analytics Dashboard:** [http://localhost:3000/admin/analytics](http://localhost:3000/admin/analytics)

---

## 📜 Project Scripts

Run these scripts from the repository root:

| Script | Command | Description |
|---|---|---|
| **Development Server** | `npm run dev` | Start Next.js development server on port 3000 |
| **Production Build** | `npm run build` | Compile Next.js production build with type checking |
| **Start Production** | `npm start` | Run compiled Next.js production server |
| **Unit & Integration Tests** | `npm test` | Run all 34 automated tests across 10 test suites |
| **MCP Server (Stdio)** | `npm run mcp` | Launch standalone Model Context Protocol server for Claude, Cursor, and AI Agents |
| **Historical CSV Import** | `npm run import:csv [file]` | Import legacy incident CSV files into SQLite database with Thai Buddhist era parsing |
| **Reset Database** | `npm run db:reset` | Force reset SQLite database and re-seed default master categories |
| **Database Migration** | `npm run prisma:push` | Push Prisma schema changes directly to SQLite database |
| **Seed Master Categories** | `npm run prisma:seed` | Seed default master categories (SAP Basis, Network, Interface, Helpdesk) |
| **Generate Prisma Client** | `npm run prisma:generate` | Regenerate Prisma Client TypeScript types |

### Importing Historical Incident CSVs
```bash
# Dry-run preview without database writes
npm run import:csv "Incident Report.csv" -- --dry-run

# Run actual import
npm run import:csv "Incident Report.csv"

# Import another month's file
npm run import:csv "path/to/Incident_Report_Nov.csv"
```

---

## 🧪 Testing

Comprehensive unit and integration test suite covering API guard, crypto, HMAC tokens, MCP sanitization, notification dispatch, and incident lifecycle:

```bash
npm test
```

---

## 🐳 Docker Deployment (Pure Docker - No Apache)

### Build and Run with Docker Compose
```bash
docker compose up -d --build
```

The container maps:
* `./data:/app/data` (persisting SQLite database)
* `./public/uploads:/app/public/uploads` (persisting attachments)
* Port `3000:3000`

---

## 🤖 Model Context Protocol (MCP) & AI Integration

Vendor-neutral AI interface supporting Claude, Cursor, Antigravity, and AI Agents:

### Stdio Transport (Desktop & Local Agents)
```bash
npm run mcp
```
Provides tools: `search_incidents`, `get_incident_detail`, `get_knowledge_insights`, and `export_km_article`.

### HTTP Endpoints
* `GET /api/mcp/v1/km`: Primary Knowledge Management endpoint. Supports `?format=markdown` for Vector DB RAG ingestion and `?format=json` for API clients.
* `GET /api/mcp/v1/context`: Backward-compatible JSON forwarder to `/api/mcp/v1/km?format=json`.
* `GET /api/mcp/v1/insights`: Aggregated KPIs, MTTA, resolution rate, and category distribution.
* **Agent & Local RAG Setup Guide:** [`docs/AGENT_KM_SETUP.md`](docs/AGENT_KM_SETUP.md)

---

## 📥 Inbound Incident API

External systems can submit incidents directly:
* `POST /api/incidents/inbound`
* Headers: `x-api-key: <YOUR_API_KEY>` (or configured in Integration Hub)

```json
{
  "title": "Database connection pool exhausted",
  "description": "High connection latency detected on main Postgres cluster.",
  "urgency": "HIGH",
  "reporterName": "Prometheus Alertmanager",
  "department": "DevOps",
  "category": "Network"
}
```

---

## 📚 Data Dictionary & Documentation

Complete schema details, ER diagrams, data contracts, and maintenance guidelines:
* **Data Dictionary:** [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md)
* **System Specification:** [`spec.md`](spec.md)
