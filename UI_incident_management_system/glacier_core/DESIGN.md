---
name: Glacier Core
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3f4850'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#707881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006398'
  primary: '#006194'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#93ccff'
  secondary: '#006591'
  on-secondary: '#ffffff'
  secondary-container: '#39b8fd'
  on-secondary-container: '#004666'
  tertiary: '#006387'
  on-tertiary: '#ffffff'
  tertiary-container: '#007da9'
  on-tertiary-container: '#fcfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#c4e7ff'
  tertiary-fixed-dim: '#7bd0ff'
  on-tertiary-fixed: '#001e2c'
  on-tertiary-fixed-variant: '#004c69'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 3.5rem
    fontWeight: '700'
    lineHeight: 4rem
    letterSpacing: -0.035em
  headline-lg:
    fontFamily: Geist
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Geist
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  title-md:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.625rem
    letterSpacing: -0.005em
  body-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0.01em
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: -0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
---

## Brand & Style

This design system delivers an ultra-crisp, analytical, and pristine operational environment tailored for mission-critical enterprise IT, cloud infrastructure orchestration, and systems observability. The visual aesthetic fuses surgical Modernism with refined, crystalline Glassmorphism—channeling arctic clarity, high-bandwidth data transparency, and uncompromising precision.

Targeted at infrastructure architects, systems engineers, and enterprise technology executives, the interface evokes calm authority, structural integrity, and cognitive relief amidst dense diagnostic data streams. Pure whites, crystalline ice-blue tints, razor-sharp deep navy typography, and luminous cyan micro-accents combine to eliminate visual clutter while maintaining absolute operational legibility.

## Colors

The palette relies on a surgical separation between crisp structural surfaces, high-contrast textual geometry, and radiant cyan-sky beacons:

- **Canvas & Backdrops:**
  - Base Application Canvas: `#f8fafc` (Cool Slate 50)
  - Secondary Workspace / Tinted Canvas: `#f0f7ff` (Ice Tint 50)
  - Elevated Container / Pristine Surface: `#ffffff` (Pure White)
  - Frost Panel Translucent Fill: `rgba(255, 255, 255, 0.85)` with backdrop-filter blur.

- **Typography & Structural Neutrals:**
  - Primary Text & Structural Headers: `#0f172a` (Deep Slate Navy 900)
  - Secondary Body & Subtitles: `#1e293b` (Mid Slate Navy 800)
  - Muted Captions, Metadata & Icons: `#475569` (Cool Grey 600)
  - Structural Hairlines & Dividers: `rgba(2, 132, 199, 0.12)` and `#e2e8f0`

- **Interactive Accents & Telemetry:**
  - Primary Action & Focus Anchor: `#0284c7` (Sky 600)
  - Interactive Hover & Focused States: `#0369a1` (Sky 700)
  - Secondary Accents & Visual Highlights: `#0ea5e9` (Sky 500)
  - Dynamic Badges & Metric Glows: `#38bdf8` (Cyan 400)
  - Accent Surface Washes: `rgba(14, 165, 233, 0.08)` to `rgba(2, 132, 199, 0.14)`

## Typography

Typography prioritizes extreme metric precision and data density. `Geist` provides structural neutrality for headers, dashboard copy, and administrative navigation. Its tight geometric tracking maintains legibility at high data density.

`JetBrains Mono` handles all technical attributes: network hashes, IP addresses, uptime percentages, log streams, and status badges. Tabular figures (`font-variant-numeric: tabular-nums`) must be active across all tables, telemetry cards, and metric streams to ensure vertical visual alignment during real-time updates.

## Layout & Spacing

The interface employs a strict 8pt grid with 4pt half-step sub-increments for compact data displays. Layouts balance maximum functional density with sufficient breathing room to prevent cognitive fatigue.

- **Desktop (1280px+):** 12-column responsive fluid grid. Outer section margin set to `2rem` (`margin-lg`), grid gutter set to `1.5rem` (`gutter-lg`). Enterprise sidebars are anchored at a fixed width of `260px`, allowing data views and topological graphs to stretch across fluid remaining columns.
- **Tablet (768px - 1279px):** 8-column layout. Margin adjusts to `1.5rem` (`margin-md`), gutter tightens to `1rem` (`gutter`). Auxiliary telemetry drawers collapse to slide-over panels.
- **Mobile (<768px):** 4-column layout. Margin collapses to `1rem` (`margin`), gutter to `1rem` (`gutter`). Complex multi-pane diagnostic views reflow into stacked priority cards with horizontal swipe tables.

## Elevation & Depth

Visual hierarchy is maintained via translucent ice-glass layering, crisp cyan-tinted perimeter borders, and ambient light-refracting drop shadows. Dark, heavy drop shadows are forbidden.

- **Base Level (Canvas):** Flat `#f8fafc` or `#f0f7ff`.
- **Level 1 (Frost Cards & Data Surfaces):** Translucent backdrop fill `rgba(255, 255, 255, 0.85)` with `backdrop-filter: blur(12px)`. Outlined with a microscopic ice-blue border: `1px solid rgba(2, 132, 199, 0.14)`. Drop shadow: `0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(2, 132, 199, 0.04)`.
- **Level 2 (Hover States & Detached Panels):** Translucent fill `rgba(255, 255, 255, 0.95)`, border `1px solid rgba(2, 132, 199, 0.25)`, drop shadow: `0 8px 24px rgba(2, 132, 199, 0.08), 0 2px 6px rgba(15, 23, 42, 0.03)`.
- **Level 3 (Modals, Command Palettes, Flyouts):** Solid `#ffffff` or `rgba(255, 255, 255, 0.98)` with `backdrop-filter: blur(20px)`. Drop shadow: `0 16px 40px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(2, 132, 199, 0.08)`, framed by `1px solid rgba(2, 132, 199, 0.20)`.

## Shapes

The geometric framework favors sharp architectural precision. A disciplined `roundedness: 1` standard applies throughout:
- Base standard controls, inputs, chips, and micro-cards utilize `0.25rem` (4px).
- Structural cards, diagnostic containers, and slide-out modals utilize `0.5rem` (8px, `rounded-lg`).
- Major full-bleed container views and floating telemetry pods utilize `0.75rem` (12px, `rounded-xl`).
- Status pips, ping indicators, and metric tags utilize full circular rounding (`9999px`).

## Components

### Buttons
- **Primary:** Solid `#0284c7` background, `#ffffff` text, font weight 500, radius `0.25rem`. Subtle box-shadow: `0 1px 2px rgba(2, 132, 199, 0.3)`. Hover: `#0369a1`. Active: `#075985`. Focus-visible ring: `2px solid #38bdf8` offset by `2px`.
- **Secondary (Ice Outline):** Background `rgba(255, 255, 255, 0.8)`, border `1px solid rgba(2, 132, 199, 0.25)`, text `#0284c7`. Hover: background `rgba(240, 247, 255, 0.9)`, border `#0284c7`.
- **Ghost:** Transparent background, text `#1e293b`. Hover: background `rgba(2, 132, 199, 0.08)`, text `#0284c7`.

### Cards & Panels
- **Telemetry Card:** Pure white or frost surface (`rgba(255, 255, 255, 0.88)`), border `1px solid rgba(2, 132, 199, 0.15)`, radius `0.5rem`. Card header features hairline separator `1px solid rgba(2, 132, 199, 0.08)` and label in JetBrains Mono.
- **Active / Alert Card:** Elevated with an additional top-border accent `2px solid #0284c7` or alert-state color wash.

### Form Inputs
- **Text Inputs & Dropdowns:** Height `36px` (compact enterprise scale), background `#ffffff`, border `1px solid #cbd5e1`, radius `0.25rem`, typography Geist `0.875rem`, text `#0f172a`.
- **Placeholder:** `#94a3b8`.
- **Focus:** Border color `#0284c7`, shadow ring `0 0 0 3px rgba(2, 132, 199, 0.15)`.

### Chips & Badges
- **Status Badges:** JetBrains Mono `0.75rem`, font weight 500, height `22px`, padding `0 0.5rem`, radius `0.25rem`.
- **Operational / Normal:** Background `rgba(2, 132, 199, 0.08)`, border `1px solid rgba(2, 132, 199, 0.20)`, text `#0284c7`.
- **Live Beacon:** Includes a pulsing 6px circle using `#38bdf8`.

### Checkboxes & Radios
- Box size `16px x 16px`, radius `2px` (checkbox) or `9999px` (radio).
- Border: `1.5px solid #94a3b8`, background `#ffffff`.
- Checked state: Background `#0284c7`, border `#0284c7`, checkmark glyph in crisp `#ffffff`.

### Data Tables
- **Header Row:** Background `#f8fafc`, typography JetBrains Mono `0.6875rem` uppercase, tracking `0.05em`, text `#475569`, bottom border `1px solid rgba(2, 132, 199, 0.18)`.
- **Rows:** Alternating rows utilize `#ffffff` and `rgba(240, 247, 255, 0.4)`. Row height `40px` (standard density). Hover state: `rgba(2, 132, 199, 0.05)`.
- **Dividers:** `1px solid #f1f5f9`.