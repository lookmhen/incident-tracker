# Design Spec: Frontend Incident Detail Component Split (Task 2)

**Date:** 2026-11-23  
**Size:** Medium refactoring  
**Status:** Approved

## Intent & Why
Decompose the 2,615-line monolithic client component `src/app/admin/incidents/[id]/page.tsx` into focused, colocation-scoped UI components under `src/app/admin/incidents/[id]/_components/`, eliminate its 5 ESLint warnings, and extract pure status/duration/file formatting helpers with unit tests—while keeping 100% identical visual styling, interactions, API calls, and state behavior.

## Goals & Non-Goals
- **Goals:**
  1. Extract shared types (`IncidentDetail`, `RelatedIncidentSummary`, `CategoryItem`, `CurrentAdminUser`, `IncidentAttachment`) and pure helpers (`normStatus`, `statusPillClass`, `formatDuration`, `formatFileSize`, `attName`, `toLocalDateTimeInput`) into `_components/types.ts` and `_components/utils.ts` with unit tests.
  2. Extract shared `AttachmentRow.tsx` and `AttachmentPreviewModal.tsx` so `REPORT` and `RESOLUTION` attachment galleries share identical preview/download/delete UI without markup duplication.
  3. Split card sections into cohesive components (`IncidentHeaderCard`, `IncidentDetailsCard`, `ResolutionEditorCard`, `LifecycleDurationCard`, `TriageSelectorsCard`, `ReportAttachmentsCard`, `RelatedIncidentsCard`, `McpPreviewAccordion`) with card-local edit/search states encapsulated inside their owning cards.
  4. Shrink `src/app/admin/incidents/[id]/page.tsx` to ~250–350 lines coordinating shared incident/resolution state, attachment uploads/deletes, and toast notifications, with zero ESLint warnings on `[id]/**`.
- **Non-Goals (Explicitly Excluded):**
  - Do **not** alter visual styling, Tailwind classes, labels, Thai copy, API request payloads, or permission logic (`MANAGER` vs `STAFF`, closed-ticket locks).
  - Do **not** add Redux/Zustand/Context abstractions (props + callbacks only).
  - Do **not** refactor other admin pages (`/admin/page.tsx`, `/admin/analytics`, `/admin/integrations`, `/admin/users`) in this branch.

## Shared State Architecture
- **`page.tsx` owns shared state that spans multiple cards:**
  - `incident`, `categories`, `rootCauses`, `currentUser`, `loading`, `now` (30s ticker when active)
  - `resolutionText`, `resolutionType`, `workaroundNote`, `managerComment`, `resolutionFeedback` (shared across `ResolutionEditorCard`, `RelatedIncidentsCard` copy-fix, `McpPreviewAccordion` preview, and header `validateReadyToClose`)
  - `previewAtt`, `uploadingKind`, `deletingAttId` (shared across `ReportAttachmentsCard`, `ResolutionEditorCard`, and `AttachmentPreviewModal`)
  - `updatingStatus`, `savingResolution`, `toast`, `showToast`, `handleUpdateStatus`, `handleAssignToMe`, `submitResolutionUpdate`
- **Cards own their local UI states:**
  - `IncidentHeaderCard`: `isEditingReporter`, `editReporterName`, `editDepartment`, `editContactInfo`, `savingReporter`, `updatingUrgency`
  - `IncidentDetailsCard`: `isEditingDetails`, `editTitle`, `editDescription`, `savingDetails`
  - `LifecycleDurationCard`: `editingTimeField`, `editTimeValue`, `savingTime`
  - `TriageSelectorsCard`: `newRootCause`, `addingRootCause`
  - `RelatedIncidentsCard`: `relatedQuery`, `relatedSearchResults`, `searchingRelated`, `savingRelated`
  - `McpPreviewAccordion`: `mcpExpanded`, `copied`
