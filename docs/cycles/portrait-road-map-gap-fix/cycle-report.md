# Portrait road-map gap-fix cycle report

Source plan: [`../../exec-plans/portrait-road-map-gap-fix/plan.md`](../../exec-plans/portrait-road-map-gap-fix/plan.md)

Base cycle report: [`../portrait-road-map/cycle-report.md`](../portrait-road-map/cycle-report.md)

## Implemented

- **G1 blocker badges** — `BlockerBadge` (red circle + white X) renders at the curve
  midpoint of every failed connection, muting with filters and active routes.
- **G2 route emphasis** — with an active route, non-route roads, summaries, segment
  corridors, records, and nodes mute to prototype opacity (roads 0.11, nodes 0.18);
  route-node labels get the gold emphasis treatment.
- **G3 arrowheads** — per-outcome arrowheads drawn as SVG polygons computed from the
  curve tangent (`arrowheadPath` in `mapGeometry.ts`), pulled back to the marker
  edge; solid for success/failed, hollow for todo; summary roads take the last
  section's outcome.
- **G4 selection visible above sheet** — selecting a node/road/segment/record now
  drives `focusCameraAboveSheet` via the pure `selectionFocusPoint` helper and the
  measured sheet height (`set-sheet-height` in the session reducer, reported by the
  sheet's `onLayout`).
- **G5 hint pill** — `MapHint` shows mode-aware copy
  (`Drag to move · pinch for detail · L0 · 100%` / `Move items · hold blank or drag ↗
  to create` / segment-selected variant) and hides while a route is active.
- **G6 live draft path** — path-handle drags report pointer position into session
  state (`set-draft-path`); the canvas renders a flowing dashed preview with a todo
  arrowhead and highlights the snap target; release validates forward direction
  ("Paths must move forward toward the top") and duplicates ("Those nodes already
  have a path") before connecting ("New segment: A → B").
- **G7 edge long-press insertion** — long-press on an edge (SVG hit path, with a
  canvas-level curve hit-test fallback) opens the composer in insertion mode;
  `runtime.insertNode` now accepts title/kind/outcome details.
- **G8 composer live preview** — while the composer is open the canvas renders a
  dashed ghost marker with the typed title plus spark roads (from the source node,
  or both endpoints for edge insertion); the source node dims.
- **G9 hold-ring** — a `HoldRing` appears at the press point during the 560 ms
  edit-mode long-press.
- **G10 motion** — `useReducedMotion` (AccessibilityInfo) gates all animation:
  draft-path flow, spark travel, selection-ring pulse, and node-in fades render
  statically when reduced motion is set.
- **Pre-existing fix** — edit-mode node/record dragging and tap-to-select never
  worked: Pressability's responder handlers override `PanResponder` handlers spread
  onto a `Pressable`. Markers now use a plain `View` with the pan responder in Edit
  mode (the pattern `DragHandle` already used).
- **G11 tests** — 22 new tests across `mapGeometry`, `selectionFocus`,
  `LifeMapCanvas` (blocker/arrowhead/muting/preview/hold-ring/edge routing),
  `MapBottomSheet` (armed delete, edge insert action), session reducer (draft path,
  composer draft, sheet height), and screen flows (hint copy, route search UI,
  composer validation, edit-mode selection).

## Verification

- `npm run check` — typecheck clean; dependency-cruiser: 36 modules, no violations;
  Jest: 12 suites, 46 tests, all passing.
- `npx expo export --platform web` — web bundle builds cleanly.

## Deviations

- Hold-ring cancel-on-move uses React Native's built-in press-retention (~20 px)
  instead of the prototype's 8 px custom tracking; `Pressable` does not expose a
  move callback and the gesture system already cancels the long-press on exit.
- Right-click edge insertion (web-only prototype affordance) is not wired; the
  long-press path covers both platforms.

## Remaining deferrals

Unchanged from the base cycle: durable persistence and sync, hierarchy editing,
branch completion semantics, automatic completion from Records, actual-history
routes, landscape/tablet layouts.
