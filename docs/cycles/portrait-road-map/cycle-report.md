# Portrait road-map cycle report

Source plan: [`../../exec-plans/portrait-road-map/plan.md`](../../exec-plans/portrait-road-map/plan.md)

Canonical specification produced by the Phase 0 reconciliation gate:
[`../../specification/life-map.md`](../../specification/life-map.md)

## Implemented

- Resolved the plan's six product conflicts in the canonical specification:
  one permanent Origin Status plus a distinct Checkpoint kind, a global
  five-level hierarchy with center-sensitive label disclosure, node outcome as
  the single source of incoming-road color, factual progress copy
  (`4 segments`, not percentages), archive-instead-of-cascade for
  Record-referenced nodes, and the bounded authoring scope.
- Marked the older plan and cycle-1 report as historical, since the source they
  described was absent from this workspace.
- Added the domain layer (`src/domain/lifeMap/`): planned nodes, connections,
  roads, nested segments, Records, separate layout document types, the
  `LifeMap` aggregate with invariant validation (single origin, DAG topology,
  Record targets, road/segment tree rules), transactional `splitConnection`,
  history-protected node removal, and the `LifeMapRepository` /
  `MapLayoutRepository` ports.
- Added the application layer: `PortraitMapProjectionService` (five semantic
  levels, summary roads with ordered endpoint-outcome sections and factual
  hidden counts, segment overlays, level-4 record attachments, center-sensitive
  optional labels, header summary, diagnostics), `FindRoadService` (cost:
  fewer failed endpoints, then fewer connections, then stable ID order; fit
  bounds and required semantic level in results), camera helpers, and the
  `LoadLifeMap`, `EditLifeMap`, and `CaptureRecord` use cases.
- Added the infrastructure layer: version-checked in-memory repositories with
  defensive copies and layout reset, plus the deterministic portrait fixture
  reproducing the prototype's three roads, isolated Kyoto nodes, cross-road
  bridges, eleven Records, and the five-deep segment tree.
- Added the UI layer: a portrait-first screen with safe-area layout, header
  with route summary/clear, SVG canvas (outcome-styled curved roads, segmented
  summary roads with hidden counts, segment corridors, kind-shaped markers,
  Record markers), a session reducer owning mode/level/camera/filters/
  selection/route/sheet state, and gesture adapters for pan, pinch, wheel,
  and double-tap zoom.
- Wired the prototype's bounded Edit workflows: node drag with depth snapping,
  Record drag without retargeting, path-handle connect-or-create, blank-space
  composer (segment-local when a segment is selected), edge insertion, curve
  bending, title/kind editing, outcome cycling, armed second-tap deletion, and
  placement reset.

## Verification

- `npm run check` — typecheck, dependency-cruiser (32 modules, no violations),
  and Jest: 8 suites, 24 tests, all passing. Coverage includes invariant
  rejection, split-membership preservation, Record-history protection,
  projection levels and summaries, route cost ordering, anchored camera math,
  repository versioning, and rendered screen/Edit-mode UI contracts.
- `npx expo export --platform web` — web bundle builds cleanly
  (256 modules, ~540 kB).

## Intentional deferrals

Durable persistence and sync (runtime is in-memory; restart restores the
fixture), general Road/segment hierarchy editing and reparenting, branch
completion semantics and aggregate percentages, automatic completion from
Records, actual-history routes, and landscape/tablet layouts.
