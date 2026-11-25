# Outbound Webhook Custom Fields & Unslop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded Teams/Power Automate UI wording and Adaptive Card mode with a generic **Outbound Webhook** configuration featuring an interactive Field Mapping Table, Live JSON Preview, and UI polish.

**Architecture:** Introduce a shared pure helper (`src/lib/webhook-fields.ts`) used by both server-side dispatch (`TeamsService`) and the client Live JSON Preview in `/admin/integrations`. Persist `customFields` inside the existing `'teams'` record of `IntegrationConfig` via `IntegrationService` (preserving partial updates and backward compatibility with existing `NotificationLog` rows and `TEAMS_WEBHOOK_URL`), enforce HTTP `400` validation in `PUT /api/integrations`, and polish `/admin/integrations` and `/admin` UI wording/states.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Prisma (SQLite), Node built-in `node:test` (`tsx --test`).

**Spec:** [docs/superpowers/specs/2026-11-25-outbound-webhook-custom-fields-design.md](../specs/2026-11-25-outbound-webhook-custom-fields-design.md)

## Global Constraints

- Remove all visible `Teams`, `Power Automate`, and `Adaptive Card` copy from `/admin/integrations`, `/admin` row forward button/feedback, and user-facing dispatch status messages; display `WEBHOOK` in Delivery Logs UI while keeping `value="TEAMS"` filter compatibility.
- Keep internal DB keys/env vars (`teams`, `TEAMS`, `TEAMS_WEBHOOK_URL`) and `/api/events/notify` (`dispatchEvent`) caller-supplied JSON pass-through intact for production compatibility.
- Reject empty arrays (`[]`), empty/whitespace keys, duplicate keys, unknown `source` values, and prototype-pollution keys (`__proto__`, `constructor`, `prototype`) with HTTP `400` in `PUT /api/integrations`.
- Preserve `current.customFields` when `saveTeamsConfig` is called with `customFields === undefined` (partial update safety).
- Apply `unslop` polish to `/admin/integrations`: neutral `border-slate-200` cards/icon wells, consistent input focus rings, `transition-colors` (no `transition-all`), status badges with dot spans + `tabular-nums` (no `●`/`▲` glyphs), pretty-printed Inspect JSON, and `disabled:opacity-50` button states.

## Review Focus

- **Empty, duplicate, or prototype-pollution JSON keys (`__proto__`, `constructor`, `prototype`)**: Must be rejected by `validateWebhookFields()` and `PUT /api/integrations` with `400`, and highlighted inline in the UI before saving.
- **Null/undefined incident fields in `buildWebhookPayload` & `{{var}}` templates**: Coerce missing fields to `''` (and `category` fallback `'General IT'`, `detail` internal department fallback `'-'`) so payloads never emit `"undefined"` or `"null"`, and pre-compute `detail` once so `{{detail}}` never recurses.
- **Legacy `payloadMode: "adaptive_card"` or missing `customFields` in DB**: `IntegrationService.getRawConfig()` must ignore `payloadMode` and fall back to `DEFAULT_WEBHOOK_FIELDS` cleanly.
- **Resend log when `incident` is missing (`CUSTOM_API` or deleted ticket)**: `POST /api/integrations/logs` must replay `log.payload` cleanly instead of sending dummy `'Resent from Delivery Logs'` text.
- **Unsaved edits vs. `Send Test Ping` & disabled Webhook URL**: Admins must be blocked/warned from clicking `Send Test Ping` with unsaved edits, and able to save `customFields` when `isEnabled` is `false` without a `required` URL block.

---

### Task 1: Shared Webhook Field Schema, Validation & Payload Builder

**Files:**
- Create: `src/lib/webhook-fields.ts`
- Test: `tests/services-mcp-notifications.test.ts`

**Interfaces:**
- Produces:
  - `export type WebhookSourceKey = 'detail' | 'ticketNo' | 'title' | 'description' | 'reporterName' | 'department' | 'contactInfo' | 'urgency' | 'category' | 'custom'`
  - `export interface WebhookFieldMapping { key: string; source: WebhookSourceKey; template?: string }`
  - `export interface WebhookPayloadInput { ticketNo: string; title: string; description: string; reporterName: string; department?: string | null; contactInfo: string; urgency: string; category?: string | null; detail?: string; incident_type?: string }`
  - `export const WEBHOOK_SOURCE_OPTIONS: ReadonlyArray<{ value: WebhookSourceKey; label: string }>`
  - `export const DEFAULT_WEBHOOK_FIELDS: WebhookFieldMapping[]`
  - `export const SAMPLE_WEBHOOK_PAYLOAD: WebhookPayloadInput`
  - `export function validateWebhookFields(fields: unknown): { valid: true; fields: WebhookFieldMapping[] } | { valid: false; error: string }`
  - `export function sanitizeStoredWebhookFields(fields: unknown): WebhookFieldMapping[]`
  - `export function buildWebhookPayload(payload: WebhookPayloadInput, fields?: WebhookFieldMapping[]): Record<string, string>`

- [ ] **Step 1: Write the failing unit tests for `webhook-fields.ts`**

Add a test block in `tests/services-mcp-notifications.test.ts` testing:
1. `buildWebhookPayload(samplePayload)` with default fields returns the 10-field object (`detail`, `urgency`, `incident_type`, `ticketNo`, `title`, `description`, `reporterName`, `department`, `contactInfo`, `category`).
2. `buildWebhookPayload` with custom field mapping (e.g. mapping `incident_type` -> `department`, plus `custom` template `"{{ticketNo}}: {{reporterName}} ({{department}})"`, plus `{{detail}}` and unknown `{{missing}}` coerced to `''`) and null/undefined field coercion.
3. `validateWebhookFields` rejects `[]`, empty/whitespace `key`, duplicate keys after trim, unknown `source`, and prototype-pollution keys (`__proto__`, `constructor`, `prototype`), while trimming valid keys and clearing `template` when `source !== 'custom'`.
4. `sanitizeStoredWebhookFields` falls back to `DEFAULT_WEBHOOK_FIELDS` for `undefined`, invalid arrays, or empty arrays.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/services-mcp-notifications.test.ts`
Expected: FAIL because `src/lib/webhook-fields.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/webhook-fields.ts`**

Create `src/lib/webhook-fields.ts` exporting the exact types, constants, `validateWebhookFields`, `sanitizeStoredWebhookFields`, and `buildWebhookPayload` using `Object.create(null)` or `Object.defineProperty` / safe key check (`FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])`), pre-computing `detail` once (`payload.detail || \`[${ticketNo}] ${title}\nรายละเอียด: ${description}\nผู้แจ้ง: ${reporterName} | แผนก: ${department || '-'} | ติดต่อ: ${contactInfo}\``), and interpolating `{{var}}` in a single pass (`/\{\{(\w+)\}\}/g`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/services-mcp-notifications.test.ts`
Expected: PASS for all new `webhook-fields` assertions.

---

### Task 2: IntegrationService Custom Fields Persistence, API `400` Validation & Log Resend

**Files:**
- Modify: `src/lib/services/integration.service.ts:5-190`
- Modify: `src/app/api/integrations/route.ts:23-45`
- Modify: `src/app/api/integrations/logs/route.ts:80-95`
- Test: `tests/services-mcp-notifications.test.ts`

**Interfaces:**
- Consumes: `WebhookFieldMapping`, `DEFAULT_WEBHOOK_FIELDS`, `validateWebhookFields`, `sanitizeStoredWebhookFields` from `@/lib/webhook-fields`
- Produces:
  - `export class IntegrationValidationError extends Error { public readonly status = 400; }` in `src/lib/services/integration.service.ts`
  - `export interface TeamsIntegrationSettings { isEnabled: boolean; webhookUrl: string; customFields: WebhookFieldMapping[]; }`

- [ ] **Step 1: Write failing tests in `tests/services-mcp-notifications.test.ts`**

Add tests (using `before`/`after` backup/restore of `'teams'` `IntegrationConfig` row):
1. `IntegrationService.saveTeamsConfig({ isEnabled: false })` preserves existing `customFields` (partial-update safety) and `getRawConfig()` falls back to `DEFAULT_WEBHOOK_FIELDS` when DB has legacy `{ webhookUrl, payloadMode: 'adaptive_card' }`.
2. `IntegrationService.saveTeamsConfig({ customFields: [{ key: 'department', source: 'department' }, { key: 'department', source: 'title' }] })` throws `IntegrationValidationError` (`status === 400`).
3. `PUT /api/integrations` with invalid `customFields` (e.g. `[]` or `__proto__` key) returns HTTP `400` with JSON `{ error }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/services-mcp-notifications.test.ts`
Expected: FAIL because `IntegrationValidationError` and `customFields` are not implemented yet.

- [ ] **Step 3: Implement changes in `IntegrationService`, `/api/integrations`, and `/api/integrations/logs`**

1. In `src/lib/services/integration.service.ts`:
   - Add `IntegrationValidationError` (`status = 400`).
   - Update `TeamsIntegrationSettings` to `{ isEnabled: boolean; webhookUrl: string; customFields: WebhookFieldMapping[] }` (removing `payloadMode`).
   - In `getRawConfig()`, sanitize `parsed.customFields` via `sanitizeStoredWebhookFields(parsed.customFields)`.
   - In `saveTeamsConfig(input)`, if `input.customFields !== undefined`, validate via `validateWebhookFields(input.customFields)` and throw `IntegrationValidationError` on failure; otherwise keep `current.customFields`. Validate `webhookUrl` if non-empty (`/^https?:\/\//i`) or required-when-enabled (`if (isEnabled && !effectiveUrl)`? Wait: allow empty `webhookUrl` when `TEAMS_WEBHOOK_URL` fallback or simulated mode is used—only validate non-empty URL starts with `http://` or `https://`). Persist `{ webhookUrl: encryptSecret(webhookUrl), customFields }` (omitting `payloadMode`).
2. In `src/app/api/integrations/route.ts`:
   - In `PUT` catch block, return `err.status` (`400`) when `err instanceof IntegrationValidationError`.
3. In `src/app/api/integrations/logs/route.ts`:
   - When `log.channel !== 'EMAIL'` and `!incident` and `log.payload` is valid JSON object, replay via `TeamsService.dispatchEvent(parsedPayload)` (only using custom `webhookUrl` if `log.destination.startsWith('http')` and wasn't truncated, or omit `webhookUrl` so configured webhook is used—wait: `TeamsService.dispatchEvent` without `webhookUrl` uses the configured webhook cleanly, avoiding truncated 80-char URL failures!). When `incident` exists, dispatch via `TeamsService.dispatch(...)` as before.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/services-mcp-notifications.test.ts`
Expected: PASS.

---

### Task 3: Update `TeamsService` & `/api/teams/ping` (Remove Adaptive Card, Use `buildWebhookPayload`)

**Files:**
- Modify: `src/lib/services/teams.service.ts`
- Modify: `src/app/api/teams/ping/route.ts:26-36`
- Modify: `tests/services-mcp-notifications.test.ts:53-83`

**Interfaces:**
- Consumes: `buildWebhookPayload`, `WebhookPayloadInput`, `WebhookFieldMapping` from `@/lib/webhook-fields`
- Produces:
  - `TeamsService.buildWebhookPayload(payload: TeamsCardPayload, customFields?: WebhookFieldMapping[]): Record<string, string>`
  - `TeamsService.buildPowerAutomatePayload(payload: TeamsCardPayload)` delegating to `buildWebhookPayload(payload)` for backwards compatibility with existing callers/tests.

- [ ] **Step 1: Update `tests/services-mcp-notifications.test.ts` and add dispatch customFields test**

Replace the `buildAdaptiveCard` test (`lines 75-82`) with tests verifying:
1. `TeamsService.buildWebhookPayload(samplePayload, [{ key: 'dept', source: 'department' }, { key: 'summary', source: 'custom', template: '{{ticketNo}} - {{title}}' }])` produces `{ dept: 'Finance', summary: 'INC-202610-777 - Database Connection Pool Exhausted' }`.
2. `TeamsService.dispatch(samplePayload)` when `TEAMS_WEBHOOK_URL` is unconfigured logs simulated `SUCCESS` using the saved `teams.customFields` and returns message without `Teams` wording.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/services-mcp-notifications.test.ts`
Expected: FAIL because `buildWebhookPayload` / updated messages do not exist yet.

- [ ] **Step 3: Implement `TeamsService` and `/api/teams/ping` updates**

1. In `src/lib/services/teams.service.ts`:
   - Remove `buildAdaptiveCard` and `payloadMode === 'adaptive_card'` check.
   - Add `buildWebhookPayload(payload, customFields)` calling `buildWebhookPayload` from `@/lib/webhook-fields`.
   - Keep `buildPowerAutomatePayload(payload)` calling `this.buildWebhookPayload(payload)`.
   - In `dispatch(...)`, build `bodyPayload = this.buildWebhookPayload(payload, teams.customFields)`.
   - Reword line 160 to `'Outbound webhook notification is currently disabled in settings.'` and line 195 to `'Dispatched in simulated mode (Webhook URL not configured).'`.
2. In `src/app/api/teams/ping/route.ts`:
   - Reword line 29 description to `'Test ping triggered from IncidentHub Operations Console to verify outbound webhook connectivity.'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/services-mcp-notifications.test.ts`
Expected: PASS.

---

### Task 4: Outbound Webhook Field Mapping UI, Wording Cleanup & Unslop Polish

**Files:**
- Modify: `src/app/admin/integrations/page.tsx`
- Modify: `src/app/admin/page.tsx:100-101,303-322,856-862` (plus render visible feedback banner/toast for `webhookPingStatus`)

**Interfaces:**
- Consumes: `WebhookFieldMapping`, `WEBHOOK_SOURCE_OPTIONS`, `DEFAULT_WEBHOOK_FIELDS`, `SAMPLE_WEBHOOK_PAYLOAD`, `buildWebhookPayload` from `@/lib/webhook-fields`

- [ ] **Step 1: Update `src/app/admin/integrations/page.tsx`**

1. **Wording cleanup (zero visible `Teams` / `Power Automate` / `Adaptive Card` copy):**
   - Header subtitle: `จัดการช่องทางแจ้งเตือนขาออก (Outbound Webhook / Email SMTP)...`
   - Card 1 heading: `Outbound Webhook`, subtitle: `ส่ง HTTP POST JSON แจ้งเตือนไปยังระบบภายนอกทันทีที่มีการแจ้งเคส`
   - Toasts: `ส่ง Webhook สำเร็จ (HTTP ...)` / `Webhook ปลายทางตอบกลับ: ...`
   - Tab 2 Inbound description (line 805): `...และยิง Webhook/Email`
   - Delivery Logs: `<option value="TEAMS">WEBHOOK</option>`, table channel badge & Inspect modal title render `log.channel === 'TEAMS' ? 'WEBHOOK' : log.channel`, and guard `inspectLog.ticketNo ? \` • ${inspectLog.ticketNo}\` : ''`.
2. **Webhook Field Mapping Table + Live JSON Preview (full-width card above SMTP or `lg:col-span-2`):**
   - Remove `Payload Schema Format` (`Power Automate JSON` / `Teams Adaptive Card v1.4`).
   - Add **Payload Fields** editor: each row renders `JSON Key` input + `Value Source` `<select>` (`WEBHOOK_SOURCE_OPTIONS`) + delete button (disabled when only 1 row left); when `source === 'custom'`, show template input below the row with clickable `{{var}}` helper chips (`ticketNo`, `title`, `description`, `reporterName`, `department`, `contactInfo`, `urgency`, `category`, `detail`).
   - Header actions: `+ Add Field` and `Reset to Defaults` (restoring `DEFAULT_WEBHOOK_FIELDS`).
   - Client-side inline validation: mark empty/whitespace or duplicate keys with `border-rose-300` + inline helper text; block save with clear toast if invalid.
   - `webhookUrl` input only `required` when `webhook.isEnabled` is true.
   - Track `savedWebhookSnapshot` (JSON string of saved config) to compute `hasUnsavedWebhookChanges`; disable or warn on `Send Test Ping` when dirty (`กรุณากด Save Webhook Config ก่อนทดสอบส่ง`).
   - Right-side **Live JSON Preview** (`<pre className="... overflow-x-auto max-h-72">`) rendering `JSON.stringify(buildWebhookPayload(SAMPLE_WEBHOOK_PAYLOAD, webhook.customFields), null, 2)`.
3. **Unslop polish:**
   - Neutral `border-slate-200` on Tab 1 cards & neutral `bg-slate-50 border-slate-200 text-slate-600` icon boxes.
   - Uniform input styling (`border-slate-200 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors`).
   - `font-semibold` card headings, `disabled:opacity-50 disabled:cursor-not-allowed` on buttons, `transition-colors` on table rows and Inspect button, `title={log.destination}` on truncated Destination cell.
   - Replace `●` / `▲` glyphs in Delivery Logs status pills with dot spans (`w-1.5 h-1.5 rounded-full`) + `tabular-nums`, and pretty-print `inspectLog.payload` when valid JSON.
   - Add `try/catch` error handling in `handleSaveMcpSec` (revert on failure) and `handleResendLog`.

- [ ] **Step 2: Update `src/app/admin/page.tsx`**

- Rename `teamsPingStatus` / `handleSendTeamsPing` to `webhookPingStatus` / `handleSendWebhookPing`.
- Update button tooltip at line 859 to ``Forward payload for ${inc.ticketNo} via Outbound Webhook``.
- Render `webhookPingStatus` as a compact status pill/toast banner in JSX so clicking the forward button gives visible feedback.

- [ ] **Step 3: Run full verification (TypeScript + Full Test Suite)**

Run:
1. `npx tsc --noEmit`
2. `npm test`
Expected: `tsc --noEmit` exits `0`; all tests in `tests/*.test.ts` pass with 0 failures.
