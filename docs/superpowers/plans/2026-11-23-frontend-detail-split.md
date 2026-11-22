# Frontend Incident Detail Component Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/app/admin/incidents/[id]/page.tsx` (2,615 lines) into colocated `_components/*` modules with zero UI/behavior drift, zero ESLint warnings in `src/app/admin/incidents/[id]/**`, and unit tests for extracted pure helpers.

**Architecture:** Extract shared types and pure helpers (`_components/types.ts`, `_components/utils.ts`), shared attachment UI (`AttachmentRow.tsx`, `AttachmentPreviewModal.tsx`, `ReportAttachmentsCard.tsx`), left-column/header cards (`IncidentHeaderCard.tsx`, `IncidentDetailsCard.tsx`, `ResolutionEditorCard.tsx`), and right-column cards (`LifecycleDurationCard.tsx`, `TriageSelectorsCard.tsx`, `RelatedIncidentsCard.tsx`, `McpPreviewAccordion.tsx`), keeping cross-card state (`incident`, `resolution*`, attachments, `toast`) in `page.tsx`.

**Tech Stack:** Next.js 16 (App Router, `'use client'`), React 19, TypeScript, Tailwind CSS, Node `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-23-frontend-detail-split-design.md`

## Global Constraints
- Must preserve 100% identical CSS/Tailwind classes, copy/labels, API endpoints, payloads, RBAC checks (`isManager`), and closed-ticket locks (`isClosed`).
- Must NOT add external state libraries (Redux, Zustand, Context providers); use explicit typed props and callbacks.
- Must keep `page.tsx` and all `_components/*` free of ESLint errors and warnings (`eslint.config.mjs` rules including `react-hooks/exhaustive-deps` and `@typescript-eslint/no-unused-vars`).
- Must NOT refactor unrelated `/admin/*` pages.

## Review Focus
- `RelatedIncidentsCard` "คัดลอกวิธีแก้" button: must append copied `rel.resolution` snippet to shared `resolutionText` in `page.tsx` (not drop it or overwrite existing non-empty text) and call `showToast`.
- `ResolutionEditorCard` vs `IncidentHeaderCard` `managerComment` & `isClosed` lock resets: closing (`RESOLVED`) via `submitResolutionUpdate` or `handleUpdateStatus` must still reset card-local `isEditingDetails` / `isEditingReporter` / `editingTimeField` (pass `isClosed` or reset via `useEffect(() => { if (isClosed) ... }, [isClosed])` in those cards, or sync cleanly).
- `page.tsx` route param (`id`) change (`Link href="/admin/incidents/${rel.ticketNo}"`): changing `id` must still reset `resolutionFeedback`, `updatingStatus`, and reload `currentUser`, `incident`, `categories`, `rootCauses`, plus card-local search/edit states (`relatedQuery`, `isEditingDetails`, `isEditingReporter`, `editingTimeField`).
- `AttachmentRow` + `AttachmentPreviewModal`: must handle `REPORT` and `RESOLUTION` kinds identically, preserve `dataTransfer.files` drag/drop and `Ctrl+V` clipboard paste on both `ReportAttachmentsCard` and `ResolutionEditorCard`, and close preview modal if the currently previewed attachment is deleted.
- Zero ESLint warnings on `src/app/admin/incidents/[id]/**` (remove unused `router`, unused `catch (e)` bindings, and fix `useEffect` dependency arrays without changing behavior).

---

### Task 1: Types, Pure Helpers (`types.ts`, `utils.ts` + Unit Tests), and Shared Attachment UI (`AttachmentRow.tsx`, `AttachmentPreviewModal.tsx`, `ReportAttachmentsCard.tsx`)

**Files:**
- Create: `src/app/admin/incidents/[id]/_components/types.ts`
- Create: `src/app/admin/incidents/[id]/_components/utils.ts`
- Create: `src/app/admin/incidents/[id]/_components/AttachmentRow.tsx`
- Create: `src/app/admin/incidents/[id]/_components/AttachmentPreviewModal.tsx`
- Create: `src/app/admin/incidents/[id]/_components/ReportAttachmentsCard.tsx`
- Create: `tests/incident-detail-utils.test.ts`

**Interfaces:**
- `_components/types.ts`: exports `RelatedIncidentSummary`, `IncidentAttachment`, `IncidentDetail`, `CategoryItem`, `CurrentAdminUser`, `RelatedSearchResult`, `ResolutionFeedback`.
- `_components/utils.ts`: exports `normStatus(status?: string | null): string`, `statusPillClass(status: string): string`, `formatDuration(startStr: string, endStr?: string | null, nowMs?: number): string`, `formatFileSize(bytes: number): string`, `attName(att: Pick<IncidentAttachment, 'fileName' | 'fileUrl'>): string`, `toLocalDateTimeInput(iso: string): string`, `buildMcpPayload(inc: IncidentDetail, resolutionText: string)`.
- `AttachmentRow.tsx`: props `{ att, tone: 'sky' | 'emerald', isClosed, isDeleting, onPreview, onDelete }`.
- `AttachmentPreviewModal.tsx`: props `{ attachment: IncidentAttachment | null, onClose: () => void }`.
- `ReportAttachmentsCard.tsx`: props `{ attachments: IncidentAttachment[], isClosed: boolean, uploadingKind: 'REPORT' | 'RESOLUTION' | null, deletingAttId: string | null, onUpload: (files: FileList | File[], kind: 'REPORT' | 'RESOLUTION') => void, onPaste: (e: React.ClipboardEvent, kind: 'REPORT' | 'RESOLUTION') => void, onPreview: (att: IncidentAttachment) => void, onDelete: (att: IncidentAttachment) => void }`.

- [ ] **Step 1: Write failing unit tests in `tests/incident-detail-utils.test.ts`**
Test `normStatus`, `statusPillClass` (all status buckets), `formatDuration` (`< 1m`, `< 60m`, `Xh Ym`, `Xd Yh` with deterministic `nowMs`), `formatFileSize` (`KB` and `MB`), `attName` (prefers `fileName`, falls back to URL basename), `toLocalDateTimeInput`, and `buildMcpPayload`.

- [ ] **Step 2: Run test to verify RED failure**
Run: `npx tsx --test tests/incident-detail-utils.test.ts`
Expected: FAIL because `_components/utils` does not exist yet.

- [ ] **Step 3: Implement `_components/types.ts`, `_components/utils.ts`, `AttachmentRow.tsx`, `AttachmentPreviewModal.tsx`, and `ReportAttachmentsCard.tsx`**
Copy exact markup, Tailwind classes, icons, and accessibility labels from `src/app/admin/incidents/[id]/page.tsx`. Ensure zero ESLint warnings (`npx eslint src/app/admin/incidents/[id]/_components`).

- [ ] **Step 4: Run focused test and lint**
Run: `npx tsx --test tests/incident-detail-utils.test.ts` and `npx eslint "src/app/admin/incidents/[id]/_components/*.{ts,tsx}"`
Expected: PASS (`0` errors, `0` warnings).

- [ ] **Step 5: Commit**
```bash
git add src/app/admin/incidents/[id]/_components/types.ts src/app/admin/incidents/[id]/_components/utils.ts src/app/admin/incidents/[id]/_components/AttachmentRow.tsx src/app/admin/incidents/[id]/_components/AttachmentPreviewModal.tsx src/app/admin/incidents/[id]/_components/ReportAttachmentsCard.tsx tests/incident-detail-utils.test.ts
git commit -m "refactor(ui): extract incident detail types, utils, and shared attachment components"
```

---

### Task 2: Extract Header, Details, and Resolution Editor Cards (`IncidentHeaderCard.tsx`, `IncidentDetailsCard.tsx`, `ResolutionEditorCard.tsx`)

**Files:**
- Create: `src/app/admin/incidents/[id]/_components/IncidentHeaderCard.tsx`
- Create: `src/app/admin/incidents/[id]/_components/IncidentDetailsCard.tsx`
- Create: `src/app/admin/incidents/[id]/_components/ResolutionEditorCard.tsx`

**Interfaces:**
- Consumes: `types.ts`, `utils.ts`, `AttachmentRow.tsx`, `DepartmentInput`.
- `IncidentHeaderCard.tsx`: manages reporter inline edit + urgency PATCH locally; takes `{ incident, isClosed, isManager, isMutatingStatus, nowMs, onIncidentUpdated, onAssignToMe, onUpdateStatus, showToast }`; resets `isEditingReporter` automatically when `incident.ticketNo` changes or `isClosed` becomes true.
- `IncidentDetailsCard.tsx`: manages title/description inline edit locally; takes `{ incident, isClosed, onIncidentUpdated, showToast }`; resets `isEditingDetails` automatically when `incident.ticketNo` changes or `isClosed` becomes true.
- `ResolutionEditorCard.tsx`: takes `{ incident, isClosed, isManager, isClaimed, isPendingConfirm, isMutatingStatus, savingResolution, resolutionText, setResolutionText, resolutionType, setResolutionType, workaroundNote, setWorkaroundNote, managerComment, setManagerComment, resolutionFeedback, setResolutionFeedback, missingToClose, resolutionAttachments, uploadingKind, deletingAttId, onUploadAttachments, onPasteImages, onPreviewAttachment, onDeleteAttachment, onSubmitResolution, onUpdateStatus, showToast }`.

- [ ] **Step 1: Implement `IncidentHeaderCard.tsx`, `IncidentDetailsCard.tsx`, and `ResolutionEditorCard.tsx`**
Preserve exact Tailwind classes, keyboard shortcuts (`Enter`/`Escape` in reporter editor), confirmation prompt on Reopen, Sanitize button logic, character/word counter, and `AttachmentRow` integration (`tone="emerald"`).

- [ ] **Step 2: Run TypeScript and ESLint checks**
Run: `npx tsc --noEmit` and `npx eslint "src/app/admin/incidents/[id]/_components/*.{ts,tsx}"`
Expected: Exit `0`, `0` errors, `0` warnings.

- [ ] **Step 3: Commit**
```bash
git add src/app/admin/incidents/[id]/_components/IncidentHeaderCard.tsx src/app/admin/incidents/[id]/_components/IncidentDetailsCard.tsx src/app/admin/incidents/[id]/_components/ResolutionEditorCard.tsx
git commit -m "refactor(ui): extract IncidentHeaderCard, IncidentDetailsCard, and ResolutionEditorCard"
```

---

### Task 3: Extract Right-Column Cards (`LifecycleDurationCard.tsx`, `TriageSelectorsCard.tsx`, `RelatedIncidentsCard.tsx`, `McpPreviewAccordion.tsx`), Wire Slim `page.tsx`, and Full Verification

**Files:**
- Create: `src/app/admin/incidents/[id]/_components/LifecycleDurationCard.tsx`
- Create: `src/app/admin/incidents/[id]/_components/TriageSelectorsCard.tsx`
- Create: `src/app/admin/incidents/[id]/_components/RelatedIncidentsCard.tsx`
- Create: `src/app/admin/incidents/[id]/_components/McpPreviewAccordion.tsx`
- Modify: `src/app/admin/incidents/[id]/page.tsx`

**Interfaces:**
- Consumes: all `_components/*` from Tasks 1–2.
- `LifecycleDurationCard.tsx`: manages `editingTimeField`, `editTimeValue`, `savingTime` locally (resetting on `incident.ticketNo` or status change); takes `{ incident, isClosed, isOnHold, isPendingConfirm, isManager, nowMs, onIncidentUpdated, showToast }`.
- `TriageSelectorsCard.tsx`: manages `newRootCause`, `addingRootCause` locally; takes `{ incident, categories, rootCauses, isClosed, onIncidentUpdated, onRootCausesUpdated, onClearFeedback, showToast }`.
- `RelatedIncidentsCard.tsx`: manages debounced `relatedQuery`, `relatedSearchResults`, `searchingRelated`, `savingRelated` locally (clearing when `incident.ticketNo` changes); takes `{ incident, isClosed, onIncidentUpdated, onAppendResolution, showToast }`.
- `McpPreviewAccordion.tsx`: manages `mcpExpanded`, `copied` locally; takes `{ incident, resolutionText, showToast }`.

- [ ] **Step 1: Implement `LifecycleDurationCard.tsx`, `TriageSelectorsCard.tsx`, `RelatedIncidentsCard.tsx`, and `McpPreviewAccordion.tsx`**
Preserve exact Tailwind classes, `AbortController` + 250ms debounce in `RelatedIncidentsCard`, HTTP-safe clipboard fallback in `McpPreviewAccordion`, and timestamp validation bounds in `LifecycleDurationCard`.

- [ ] **Step 2: Refactor `src/app/admin/incidents/[id]/page.tsx` to compose the `_components/*` cards cleanly**
Keep `useEffect` dependencies clean (move fetchers or wrap with `useCallback` / keep inline inside `useEffect` with `cancelled` flag), remove unused `useRouter`, and handle all 5 prior ESLint warnings in `page.tsx` without changing behavior.

- [ ] **Step 3: Run full verification suite (`tsc`, `lint`, `test`, `build`)**
Run:
- `npx tsc --noEmit` -> Expected: Exit 0
- `npx eslint "src/app/admin/incidents/[id]/**/*.{ts,tsx}"` -> Expected: `0` errors, `0` warnings
- `npm run lint` -> Expected: Exit 0 (`0` errors, pre-existing warnings reduced from 18 to 13)
- `npm test` -> Expected: All tests PASS (`0` fail)
- `npm run build` -> Expected: Exit 0

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/incidents/[id]/
git commit -m "refactor(ui): compose IncidentDetail page from modular _components"
```
