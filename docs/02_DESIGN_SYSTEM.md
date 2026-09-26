# 02. Design system, CSS, and game presentation

Status: chosen product direction. Use a clean academic tool around a charming pirate arena. Carry forward the course's blue/rose, light-card direction, not a dark military command interface. Do not require external fonts or paid assets.

## Contents

1. Visual language and tokens
2. Layout and reusable components
3. Arena art and animation
4. Accessibility and motion
5. Screen-specific quality gates

## 1. Visual language and CSS tokens

Use light neutral page backgrounds, white cards, deep navy text, blue primary actions, rose secondary/team accents, and warm sand in the game. Reserve parchment texture for small decorative areas, not forms or code. Use system sans-serif by default; Inter may be used only when already available with the project, without a blocking remote request. Use monospace for code, numbers, and schema inspection. Never use emoji as shipped ships, buttons, or primary icons.

```css
:root {
  --color-bg: #f9fafb;
  --color-surface: #ffffff;
  --color-surface-muted: #f1f5f9;
  --color-text: #17263c;
  --color-text-muted: #526174;
  --color-border: #dce3ec;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-accent: #f43f5e;
  --color-danger: #b42336;
  --color-success: #18734b;
  --color-focus: #123b96;
  --color-water: #c9eef2;
  --color-water-deep: #8fd0df;
  --color-sand: #f4dfaa;
  --color-island: #87ba8a;
  --color-ink: #20324c;
  --team-blue: #2563eb;
  --team-rose: #e04465;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-control: 8px;
  --radius-card: 20px;
  --radius-pill: 999px;
  --shadow-card: 0 8px 24px rgb(23 38 60 / 0.06);
  --font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-code: ui-monospace, SFMono-Regular, Consolas, monospace;
  --duration-fast: 120ms;
  --duration-normal: 200ms;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--color-bg); color: var(--color-text); }
button, input, select, textarea { font: inherit; }
button { min-height: 44px; border-radius: var(--radius-control); }
button:focus-visible, a:focus-visible, input:focus-visible {
  outline: 3px solid var(--color-focus); outline-offset: 3px;
}
.card { background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.numeric { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; }
  .decorative-motion { animation: none !important; transition: none !important; }
}
```

These are starting tokens. Measure contrast on actual rendered foreground/background pairs; a token palette is not an accessibility certification. Do not use pale rose for small text on white. Provide a light theme first. A dark code editor inside the light shell is acceptable; dark mode for the whole product is optional.

## 2. Layout and component patterns

Use React for forms, navigation, inspector panels, and tables; Canvas 2D for the arena. Never create a DOM component for every water particle or update all React state at 60 Hz. Store frame data in renderer-owned buffers and throttle UI diagnostics to approximately 5-10 updates/s.

Top navigation: Play, Learn, Agents, Tournaments, Classroom. Show a local-workspace badge and an export/backup action. Instructor view is a local workspace mode, not real authorization. Limit dense toolbar controls; give each screen a clear primary action.

Agent Lab at >=1280 px: code panel 34%, arena 42%, inspector 24%; allow resizable panels and a lower console drawer. At 900-1279 px use code/arena plus inspector tabs. Below 900 px use tabs; allow viewing/testing on mobile but label long training and multi-agent tournaments as desktop-oriented. Do not squeeze three columns onto a phone.

Create reusable `AppShell`, `PageHeader`, `Card`, `Button`, `IconButton`, `FormField`, `Tabs`, `StatusBadge`, `MetricTile`, `DataTable`, `EmptyState`, `ErrorPanel`, `FileDropzone`, `ProgressBar`, `ArenaCanvas`, `Timeline`, `ObservationTree`, `ActionInspector`, and `MatchupMatrix` components. Each has loading/empty/error/disabled states. Prefer semantic HTML around the canvas and accessible equivalents for graph/table data.

Use CSS Modules for components and a single token sheet for shared values. Avoid large inline style objects, global selector leakage, magical z-index values, and per-screen duplicates. Establish z-index layers for world, HUD, popover, modal, and toast. Use native buttons/inputs, label every control, and keep keyboard focus visible.

## 3. Arena art and animations

Art direction: friendly compact pirate ships, two-tone wooden hulls, cream sails with faction emblems, soft island shapes, a narrow sand shore, modest water texture, and clear flags. Use consistent line weight, light direction, and scale. Gameplay geometry remains top-down even if artwork has a slight illustrative perspective.

Ships need directional appearances for east, southeast, south, southwest, west, northwest, north, and northeast. Use 8 atlas orientations with consistent hull center/pivot and 2-3 sail/wake phases, or a procedural rotatable hull with direction-dependent sail rendering. Map heading to nearest orientation with a small hysteresis to avoid flicker around boundaries. Turning physics stays continuous. Do not rotate an isometric sprite arbitrarily and pretend its view changed.

Source frame 128 x 128 px; logical display hull approximately 32-44 px at default camera scale. Pivot centered on physical hull, not sail tip. All frames use the same transparent padding. Preserve team color plus a distinct sail emblem (circle vs diamond), so teams remain distinguishable without color.

Suggested presentation-only effects:

| Event/condition | Effect | Suggested duration |
|---|---|---:|
| Moving ship | Small rear wake, rate scaled by speed | 0.3-0.7 s particles |
| Shot fired | Brief flash, tiny recoil, smoke puff | 80-180 ms |
| Projectile | Dark cannonball, subtle trail | Physical flight lifetime |
| Water miss | Small expanding splash | 250-400 ms |
| Ship hit | Short hull tint and optional small health change | 100-180 ms |
| Ship sunk | Tilt, lower opacity/scale, bubbles, disappear | 0.9 s |
| Respawn | Water ring plus protection shimmer | 0.5-1 s |
| Flag pickup/give/place | Small flag bounce/transfer arc | 150-250 ms |
| Capture | Base ring and restrained score emphasis | 400-700 ms |

A flag transfer arc is only an animation of an already completed atomic transfer. Sinking must never delay respawn scheduling or remove a ship twice. Keep camera shake off by default. No flashing full-screen victory sequences. At accelerated playback, limit or mute repetitive effects.

Draw layers in order: water, island shadows/terrain, sites/bases, visible wakes, ships/flags, projectiles, foreground effects, fog presentation, HUD/selection annotations. Apply visibility filtering before creating observer-visible entities/effects, not only a translucent fog layer over omniscient graphics. For an omniscient classroom spectator, clearly label the perspective as not available to the agents.

## 4. Accessibility and controls

Provide mute, master/effects volume, reduced effects, reduced motion, high-contrast team markers, readable health bars, and keyboard navigation. Honor the operating system's reduced-motion preference in both CSS and the Canvas animation controller. Essential ship movement remains visible, but wake clutter, bobbing, zooms, shake, and confetti can be disabled.

Every chart needs title, units, axis labels, sample count, and a data-table/export equivalent. The pairwise matrix must be keyboard-selectable. Announce match completion and import errors without announcing every physics tick. Do not encode losses/wins solely in green/red.

Projector mode uses 20 px minimum main text, 32+ px score/rank values, large contrast, no code editor by default, and aliases rather than student emails. Add fullscreen exit guidance and a visible replay/live status label. Keep a text scoreboard if graphics acceleration is unavailable.

## 5. Visual acceptance

Capture screenshots at 1440x900, 1024x768, and 390x844 CSS pixels, plus a 1920x1080 projector view. Check no clipped dialogs, unreadable labels, unreachable controls, horizontal page overflow, or blank canvas after resize. Show one real running match with fire, impact, sinking, respawn, flag transfer, and land placement. Show reduced-motion and muted variants. Use the bundled [asset workflow](04_VISUALS_AND_AUDIO_WORKFLOW.md); visual success cannot be claimed from source code alone.
