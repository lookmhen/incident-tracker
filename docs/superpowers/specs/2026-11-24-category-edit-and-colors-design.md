# Category Color Usage & Retroactive Editing

## Intent & Why
Make `Category.color` actually render across admin cards/badges and Analytics charts, and let admins edit existing Category names, colors, and descriptions retroactively while keeping historical tickets unified.

## Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Add inline Edit mode (`name`, `color`, `description`) per row in the `Manage Categories` modal (`/admin`) backed by `PATCH /api/categories/[id]`.
  - Sync renamed categories across existing `Incident` rows (`category` & `categoryId`) in a database transaction so filters and Analytics remain unified.
  - Ensure `TriageSelectorsCard` passes both `category` and `categoryId` when Staff selects a category.
  - Render `Category.color` consistently using a color dot + soft tinted background + dark readable text (`#0284c7` fallback; `#64748b` for `Uncategorized`) in:
    - `/admin` table Category pill
    - `/admin/incidents/[id]` Header Category pill & `TriageSelectorsCard` buttons
    - `/admin/analytics` Chart 2 (`By Category`) bars & legend dots
- **Non-Goals:**
  - Changing category RBAC or adding category permissions beyond existing admin auth.
- **Anti-Goals:**
  - Leaving historical `Incident.category` text stale after a rename (splits analytics/filters).
  - Using light-colored text directly on white backgrounds when bright hex colors (e.g., yellow) are chosen.

## Approaches Considered
- **Single clear approach (Picked):** Transactionally sync `Category` rename into matching `Incident` rows + attach `color` in `byCategory` analytics and render tint+dot pills across UI.
- **Rejected alternative:** Rename `Category` row only without updating `Incident.category` (breaks historical filters/charts into duplicate names).

## Left to the Builder
- Exact CSS/inline rgba tint styling (`${hex}18` bg, `${hex}45` border, solid `${hex}` dot).
- Tests verifying category rename updates existing incidents and `byCategory` includes `color`.
