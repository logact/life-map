# Portrait road-map gap-fix plan

Status: **Implemented — 2026-09-02**

Implementation report: [`../../cycles/portrait-road-map-gap-fix/cycle-report.md`](../../cycles/portrait-road-map-gap-fix/cycle-report.md)

Prototype: [`portrait-road-map.html](../../prototypes/portrait-road-map.html)

Base implementation plan: [`../portrait-road-map/plan.md](../portrait-road-map/plan.md)

Cycle report: [`../../cycles/portrait-road-map/cycle-report.md](../../cycles/portrait-road-map/cycle-report.md)

## Objective

Close the verified behavioral and visual gaps between the current implementation and the
`portrait-road-map` prototype. The base cycle implemented the prototype's core
behavior; this plan covers what is still missing, verified by direct comparison on
2026-09-02.

## Verified gap inventory

### Rendering and visual states

- **G1. Failed-road blocker badge.** The prototype renders a red blocked marker (circle +
  white X) at the midpoint of every failed connection (prototype L3021–3025); the canvas has no
  blocker rendering.
- **G2. Route emphasis.** With an active route, the prototype mutes non-route roads and nodes
  (opacity 0.18 + desaturate) and styles route-node labels and the target; the implementation
  only draws the route road. `LifeMapCanvas.tsx` has no route-muted state.
- **G3. Arrowheads.** The prototype gives each road a per-state arrowhead marker; the
  implementation has none.
- **G4. Selection-visible-above-sheet.** `focusCameraAboveSheet` exists in
  `src/application/map/camera.ts` and is unit-tested, but the UI never calls it, so a selected
  node/road/segment can sit behind the open bottom sheet. This is an acceptance-matrix item
  in the base plan.
- **G5. Hint pill.** The prototype has a dynamic hint pill under the mode switch (mode/zoom/
  selection copy, hidden while a route is active); no hint component exists.
- **G6. Live draft path.** Path-handle drag connects on release with a 66px snap radius but has
  no flowing dashed preview, no forward-target highlight, and no invalid-target feedback
  ("Paths must move forward…", "already have a path" toasts).
- **G7. Edge long-press insertion.** The prototype inserts a node via long-press/right-click
  on an edge; the implementation offers insertion only via the detail sheet.
- **G8. Composer live preview.** Ghost node + spark road while typing; the source dims.
  None of this exists.
- **G9. Blank long-press hold-ring** (560ms indicator, cancel on move) — long-press works but
  there is no visual hold indicator.
- **G10. Animations and reduced motion.** Selected ring/sparkle, spark-on-edit, node-in,
  draft-path flow, blank-hold ring — none exist; no reduced-motion handling.
- **G11. Test coverage.** No gesture, composer-validation, route-search UI,
  delete-confirmation UI, or prototype-state comparison tests.

Out of scope (Phase 0 reconciliation decisions): 42% progress bar (replaced by factual
copy), coupled semantic/camera zoom, phone frame chrome, persistence (deferred), and other
items already listed in the base plan's explicit deferrals.

## Gap-fix phases

### Phase A — Visual states and camera wiring

A1. **Blocker markers** (G1): in `src/ui/map/LifeMapCanvas.tsx`, render a red blocker badge at the curve
midpoint of connections whose endpoint outcome is failed. Geometry from the existing
projected connection path; no application change needed beyond ensuring the
outcome is present in the projection (already is).

A2. **Route muting** (G2): given `activeRoute` in session state, pass `routeConnectionIds`/`routeNodeIds` to
`LifeMapCanvas` and node layer; mute non-route elements, highlight route nodes/target
label. UI-only state, no projection change.

A3. **Focus above sheet** (G4): call `focusCameraAboveSheet` from
`src/ui/map/LifeMapScreen.tsx` when a selection opens a sheet, using the selected item's
projected screen point and the sheet height from session state.

A4. **Arrowheads** (G3): draw arrowheads as small `<Path>` polygons computed from curve
tangent at endpoint in `mapGeometry.ts` (avoid SVG markers — react-native-svg support
is partial); derive size/color from outcome state.

A5. **Hint pill** (G5): new component in `MapControls.tsx` or standalone; copy driven by
mode, level, scale, selection; hidden when route active.

### Phase B — Edit-mode feedback

B1. **Live draft path** (G6): extend `useLifeMapSession` draft state with pointer target;
render flowing-dashed preview path + highlight valid forward targets in canvas; add
toasts for invalid target / existing connection on release validation.

B2. **Edge long-press** (G7): wire long-press on edge hit paths to open insertion composer
directly (reusing existing insert flow).

B3. **Composer live preview** (G8): while composer is open, render a ghost node at target
point with a spark road from source (path-drag case) or at blank point; dim source node.

B4. **Hold-ring indicator** (G9): RN Animated ring at press point during 560ms long-press.

### Phase C — Polish and motion

C1. Reduced-motion handling via AccessibilityInfo; skip animations when set.
C2. Selected/created animations minimal set (spark on edit, node-in) using built-in
Animated only — no new dependencies unless decided per plan note.
C3. Toast copy parity for the new edit flows.

### Phase D — Tests and verification

- Add tests: blocker rendering, route muting, focus-above-sheet wiring, hint, draft-path
  reducer transitions, edge long-press, preview states.
- `npm run check` (typecheck, depcruise, jest).
- Update `docs/cycles/portrait-road-map/cycle-report.md` (or new cycle doc) with evidence.

Estimated effort per phase small; all work UI/application, no domain changes needed.
