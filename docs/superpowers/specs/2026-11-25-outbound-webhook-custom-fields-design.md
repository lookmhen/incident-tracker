# Outbound Webhook Custom Fields & Unslop Design

## Intent & Why
- Replace hardcoded `Teams` / `Power Automate` UI copy and remove `Adaptive Card` mode so the system operates purely as a generic **Outbound Webhook** (HTTP POST JSON).
- Let admins customize outbound JSON keys and mapped incident values directly in `/admin/integrations` (e.g. mapping `incident_type` -> `department`, adding custom `{{var}}` templates) with a live JSON preview.

## Goals / Non-Goals / Constraints
- **Goals:**
  - Remove all visible `Teams` / `Power Automate` / `Adaptive Card` UI copy in `/admin/integrations`, `/admin` (row forward button + feedback), and user-facing dispatch status messages; display `WEBHOOK` in Delivery Logs UI while keeping `value="TEAMS"` filter compatibility.
  - Add a **Field Mapping Table + Live JSON Preview** editor in `/admin/integrations` persisted via `IntegrationConfig`.
  - Apply light-slop polish (`unslop`) to `/admin/integrations`: neutral `border-slate-200` cards and icon wells, consistent input focus rings, `transition-colors`, clean HTTP status badges (`tabular-nums` + dot span instead of `●`/`▲` glyphs), pretty-printed JSON in Inspect modal, and `disabled:opacity-50` states.
- **Non-Goals:** Nested/multi-level JSON objects, per-channel custom HTTP headers, altering `/api/events/notify` (`dispatchEvent`) caller-supplied JSON structure, or renaming internal DB keys/env vars (`teams`, `TEAMS`, `TEAMS_WEBHOOK_URL`) that would break existing production configs or 14-day logs.
- **Constraints & Edge Cases Settled via Cross-Check:**
  - `saveTeamsConfig` preserves `current.customFields` when `input.customFields === undefined` (partial-update safety for existing callers/tests).
  - `customFields` validation rejects empty arrays (`[]`), empty/whitespace keys, duplicate keys, unknown `source` values, and prototype-pollution keys (`__proto__`, `constructor`, `prototype`) with HTTP `400` in `PUT /api/integrations`.
  - `getRawConfig()` falls back to `DEFAULT_WEBHOOK_FIELDS` (matching the existing 10-field flat payload) when `customFields` is missing/malformed and ignores legacy `payloadMode: 'adaptive_card'`.
  - `webhookUrl` is required only when `isEnabled` is true (or validated as `http(s)://` when non-empty), so admins can save `customFields` while webhook is disabled.
  - `Send Test Ping` warns/blocks when `customFields` or `webhookUrl` has unsaved edits so admins don't test stale DB config by mistake.
  - `POST /api/integrations/logs` resend safely replays `log.payload` when the referenced incident does not exist (e.g. `CUSTOM_API` or deleted ticket).

## Architecture & Changes
- **`src/lib/webhook-fields.ts` (New shared pure helper):** Defines `WebhookFieldMapping`, `WEBHOOK_SOURCE_OPTIONS`, `DEFAULT_WEBHOOK_FIELDS` (preserving the 10 standard keys/fallbacks), `validateWebhookFields()`, and `buildWebhookPayload(payload, fields?)` (single-pass `{{var}}` interpolation with null-safe string coercion and `detail` pre-computed to avoid recursion) shared by server dispatch and client live preview.
- **`src/lib/services/integration.service.ts`:** Add `customFields: WebhookFieldMapping[]` to `TeamsIntegrationSettings`, drop `payloadMode` from active settings/save, add typed `IntegrationValidationError` (`status = 400`), and preserve `customFields` on partial updates.
- **`src/app/api/integrations/route.ts` & `src/app/api/integrations/logs/route.ts`:** Return `400` for `IntegrationValidationError` on `PUT`; support `log.payload` fallback on non-email resend when `incident` is null.
- **`src/lib/services/teams.service.ts` & `src/app/api/teams/ping/route.ts`:** Remove `buildAdaptiveCard` and `adaptive_card` branching; `dispatch()` builds JSON via `buildWebhookPayload(payload, teams.customFields)` (keep `buildPowerAutomatePayload` delegating to `buildWebhookPayload` or update callers/tests cleanly); reword user-facing status messages away from `Teams`.
- **`src/app/admin/integrations/page.tsx` & `src/app/admin/page.tsx`:** Replace `Teams` wording with `Outbound Webhook` / `Webhook`, remove Adaptive Card selector, give the Webhook card comfortable width (`lg:col-span-2` or balanced non-stretching layout) for the Field Mapping editor + clickable `{{var}}` chips + `Reset to Defaults` + Live JSON Preview, wire visible toast/banner feedback for `admin/page.tsx` forward button, and apply `unslop` polish.
- **`tests/services-mcp-notifications.test.ts`:** Update tests to verify `buildWebhookPayload`, custom field mapping, `{{var}}` templates, validation (`400` / prototype-pollution / empty-key rejection), and partial-update preservation (with DB state backup/restore).
