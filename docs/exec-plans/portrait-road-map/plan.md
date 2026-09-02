# Portrait Road Map implementation plan

Status: **Implemented — 2026-09-02**

Implementation report: [`../../cycles/portrait-road-map/cycle-report.md`](../../cycles/portrait-road-map/cycle-report.md)

Prototype: [`portrait-road-map.html`](../../prototypes/portrait-road-map.html)

Historical requirements: [`life-map-development-requirements.md`](../../../life-map-development-requirements.md)

Historical architecture plan: [`life-map/plan.md`](../life-map/plan.md)

Planned implementation report: `docs/cycles/portrait-road-map/cycle-report.md`

## Objective

Implement the portrait road-map prototype as a production-shaped Expo/React Native
application while preserving the repository's inward dependency rule:

```text
ui -> application -> domain
                 ^
           infrastructure
```

The implementation must reproduce the prototype's useful behavior, not copy its
single-file DOM architecture. Domain rules, graph mutations, route search,
projection, and layout belong behind application services. React Native renders
read models and sends commands; it does not mutate arrays of nodes and edges.

The target is an iOS-first, portrait experience that also works in Expo web. The
native app uses the real safe area and system status bar. The prototype's outer
phone frame and simulated status icons are reference presentation only and are
not application UI.

## Workspace reality

This is a fresh implementation, not an incremental UI restyle:

- The repository has Expo, React Native, React Native SVG, Jest, and architecture
  tooling configured.
- There is currently no `App.tsx`, `index.ts`, `src/`, or `__tests__/` tree.
- The older implementation plan and cycle report say that an MVP exists, but the
  described source and tests are absent from this workspace. They are architecture
  references, not a code baseline.
- The requirements document points to `docs/specification/life-map.md`, which is
  also absent. Product reconciliation is therefore the first implementation gate.

## Prototype contract

### Visual structure

- A full-screen, forward-upward map sits below a compact header.
- The header contains the Life Map identity, route search, reset, legend, and a
  summary that switches to the active route.
- The map uses a warm paper canvas, forest typography, compact markers, curved
  directed roads, nested segment corridors, and bottom sheets.
- Marker shape communicates kind: permanent Start, Goal, Task, situation
  checkpoint, and Record.
- Marker fill and incoming road style communicate endpoint outcome: successful,
  todo, or failed. A road does not own a second independent completion state.
- Records are the smallest markers and connect directly to their Goal or Task.
- The 390 by 844 point prototype is the reference viewport. Layout must use
  responsive safe-area bounds rather than hard-coding that device size.

### Semantic hierarchy

The prototype has two related zoom axes:

1. A five-level semantic hierarchy selects the visible road/segment detail.
2. A continuous camera scale and pan transform the visible map.

The initial hierarchy contract is:

| Level | Visible map content | Segment presentation |
| --- | --- | --- |
| 0 | Start and top destinations | One parent corridor and collapsed road per destination |
| 1 | Start, early direction nodes, near-goal nodes, destinations | Child segments plus local summary connections |
| 2 | All planned nodes and atomic connections | Milestone segments |
| 3 | All planned nodes and atomic connections | Node-group segments |
| 4 | All planned nodes, atomic connections, and Records | Atomic segment and evidence detail |

Summary roads preserve the ordered outcome sections of the hidden connections,
show a factual hidden-node count, and expand one semantic level when selected.
Summary nodes and connections are derived read-model objects; they are never
stored as canonical graph entities.

### Interaction modes

`Visual` mode supports:

- pan by dragging blank space;
- pinch, wheel, double-tap/double-click, and `+`/`-` camera zoom around an anchor;
- semantic-level controls independent of camera scale;
- selecting a node, road, or segment and opening a bottom detail sheet;
- route search from any planned node to any reachable destination;
- active-route fit, emphasis, metadata, and clearing;
- outcome filters in the legend;
- resetting camera position and scale.

`Edit` mode supports:

- selecting and dragging planned nodes, with vertical snapping to road depth;
- moving Records near their target without changing the target;
- dragging a selected node's path handle to connect an existing forward node or
  create a new connected node;
- long-pressing blank map space to create an isolated node or a node inside the
  selected segment;
- long-pressing an edge or using its detail action to insert a node and split the
  connection;
- dragging an edge to adjust its curve;
- editing a node's title and kind;
- cycling a node outcome, which updates every incoming connection presentation;
- deleting nodes and edges through an armed, second-tap confirmation;
- resetting editable placements;
- adding a Record to a Goal or Task, with the selected item suggested as target.

## Product reconciliation gate

The portrait prototype is the UX authority for this plan, while the historical
requirements remain the safety authority for Records and route integrity. The
following conflicts must be resolved in the canonical specification before Phase
1 domain code is accepted:

| Conflict | Prototype behavior | Historical requirement | Proposed resolution |
| --- | --- | --- | --- |
| Start and Status | Permanent `Start` plus creatable intermediate Status checkpoints | Exactly one Status origin; no Updated Status | Keep one canonical `OriginStatus`; introduce `Checkpoint` as a distinct planned kind and label it "Status checkpoint" in UI only if product approves that copy. |
| Semantic center | Hierarchy level is global; panning changes geometry only | Panning changes which branch gains detail | Preserve the prototype's five levels, but make optional detail and labels center-sensitive inside each level so pan still affects local disclosure. |
| Road state | Connection color is derived from its endpoint outcome | Planned/structural/record edge types carry semantic meaning | Store node `Outcome`; derive road color from the endpoint; retain a separate connection `meaning` and attachment kind rather than conflating meaning with outcome. |
| Progress | Header shows a sample `42%` progress bar | Multi-path aggregate percentages are deferred | Replace the percentage with derived factual progress such as `4 segments` until branch-completion semantics are specified. |
| Deletion | Deleting a node also removes attached Records in the prototype script | Record history and exact targets should be preserved | Archive a referenced target or require explicit destructive confirmation; never silently cascade-delete Records. |
| Authoring | The prototype contains a full in-map editor | The historical MVP deferred authoring | This plan includes the prototype's bounded authoring workflows; arbitrary road reparenting and a general hierarchy editor remain deferred. |

Phase 0 records the approved answers in a new canonical
`docs/specification/life-map.md` and marks the older plan/report as historical so
future work does not treat missing code as implemented.

## Target model

Names may be refined during Phase 1, but the layers must preserve these concepts.

```ts
type PlannedKind = "originStatus" | "goal" | "task" | "checkpoint";
type Outcome = "success" | "todo" | "failed";

interface PlannedNode {
  id: string;
  kind: PlannedKind;
  title: string;
  description: string;
  outcome: Outcome;
}

interface Connection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  meaning: string;
}

interface Road {
  id: string;
  title: string;
  destinationGoalId: string;
  rootSegmentId: string;
}

interface RoadSegment {
  id: string;
  roadId?: string; // absent for a standalone connection segment
  parentSegmentId?: string;
  title: string;
  memberNodeIds: string[];
  connectionIds: string[];
}

interface RecordEntry {
  id: string;
  targetId: string; // exact Goal or Task
  occurredAt: string;
  summary: string;
  content?: string;
}

interface MapPlacement {
  nodeId: string;
  worldX: number;
  depthRank: number;
  inlineWorldY?: number;
}

interface ConnectionBend {
  connectionId: string;
  offsetX: number;
  offsetY: number;
}
```

Semantic topology and user-edited layout are separate. The repository stores a
validated Life Map snapshot and a layout snapshot, but changing a position or
curve does not mutate domain meaning.

Domain invariants include:

- exactly one active origin with no incoming connection;
- every connection points forward in the directed acyclic graph, independent of
  its current screen coordinates;
- a Record targets exactly one existing Goal or Task;
- node outcome is the single source of truth for all incoming connection colors;
- every road names a Goal destination and has one rooted segment tree;
- each child segment belongs to one parent inside the same road;
- segment membership references existing nodes and connections;
- segment containment is acyclic and supports arbitrary depth;
- shared connections may participate in multiple roads only through explicit
  road-specific segment memberships;
- splitting an edge, deleting an edge, and adding a node are transactional;
- inserting into an edge replaces `A -> B` with `A -> N -> B` without changing
  reachability or silently losing segment membership;
- referenced Record targets are archived or explicitly handled, never silently
  removed.

## State ownership

| State | Owner |
| --- | --- |
| Nodes, outcomes, connections, Roads, nested segments, Records | Domain aggregate through repository port |
| Placements and connection bends | Layout document through repository port |
| Projection, summaries, route results, visible segment overlays | Application services/read models |
| Visual/Edit mode, semantic level, camera, filters, selection, active route, open sheet, draft | UI session reducer |
| Gesture pointer coordinates and animation values | UI gesture adapter |

Keeping drafts and camera state out of the domain prevents canceled gestures from
creating partial graph mutations. Every committed edit is an application command
that validates and writes one atomic snapshot update.

## Application contracts

### Projection

`PortraitMapProjectionService` accepts the canonical snapshot, layout, viewport,
semantic level, camera, focus, filters, and previous projection. It returns a
render-ready model:

```ts
interface PortraitMapProjection {
  nodes: ProjectedNode[];
  connections: ProjectedConnection[];
  summaryConnections: ProjectedSummaryConnection[];
  segmentOverlays: ProjectedSegmentOverlay[];
  recordAttachments: ProjectedRecordAttachment[];
  headerSummary: HeaderSummary;
  diagnostics: ProjectionDiagnostics;
}
```

The service derives endpoint outcome styles, hidden counts, summary color
sections, segment badges, labels, and record eligibility. The UI never reads
segment membership arrays to decide visibility.

### Route search

`FindRoadService` searches only canonical directed connections. Its initial cost
function matches the prototype: prefer fewer failed endpoints, then fewer hops,
then stable ID order. The result includes node IDs, connection IDs, blocked count,
the minimum semantic level needed to reveal it, and world bounds for camera fit.

### Commands

Application use cases cover:

- create, edit, archive/delete, and move a planned node;
- connect nodes and update connection bend;
- insert a node into a connection;
- change a node outcome;
- create a Record with an exact target;
- reset layout to deterministic placements.

Each use case reloads the current snapshot, applies a domain operation,
transactionally saves the result, and returns an updated projection or typed
error. UI components do not call repositories directly.

## Target source layout

```text
App.tsx
index.ts
src/
  domain/lifeMap/
    entities.ts
    LifeMap.ts
    LifeMapErrors.ts
    repository/
      LifeMapRepository.ts
      MapLayoutRepository.ts
  application/map/
    PortraitMapProjectionService.ts
    RoadLayoutService.ts
    FindRoadService.ts
    projectionTypes.ts
  application/lifeMap/
    LoadLifeMap.ts
    EditLifeMap.ts
    CaptureRecord.ts
  infrastructure/memory/
    MemoryLifeMapRepository.ts
    MemoryMapLayoutRepository.ts
    portraitRoadMapFixture.ts
  ui/composition/
    createLifeMapRuntime.ts
    LifeMapProvider.tsx
  ui/map/
    LifeMapScreen.tsx
    LifeMapCanvas.tsx
    MapHeader.tsx
    MapControls.tsx
    MapBottomSheet.tsx
    MapComposer.tsx
    useLifeMapSession.ts
    useMapGestures.ts
    mapTheme.ts
    mapGeometry.ts
__tests__/
  domain/
  application/
  infrastructure/
  ui/
```

The exact split may change to keep files cohesive. Infrastructure construction
remains confined to `src/ui/composition/**`.

## Work plan

### Phase 0 - Canonical decisions and scaffold truth

- Resolve the six conflicts in the product reconciliation table.
- Write `docs/specification/life-map.md` as the canonical product contract.
- Mark the older plan/report as historical and remove their false current-workspace
  claims without deleting their useful architecture rationale.
- Inventory the existing Expo/tooling files and keep user changes intact.
- Add the missing entry points and an empty composition root.
- Update dependency-cruiser rules so every domain repository port is protected
  from direct UI use outside `src/ui/composition/**`.
- Confirm supported platforms and the smallest portrait viewport.

Deliverable: an approved specification and a bootable, truthfully documented
Expo shell.

### Phase 1 - Domain topology and mutation rules

- Implement entities, value types, aggregate construction, and typed errors.
- Implement validation for origin, acyclicity, Road/segment containment,
  membership, Record targets, and archive behavior.
- Implement transactional operations for node creation/editing, connecting,
  splitting, outcome changes, deletion/archive, and Record capture.
- Add fixtures matching the prototype's marathon, family, studio, isolated Kyoto,
  cross-road bridges, Records, and deep segment hierarchy.
- Test valid parallel branches, merges, shared connections, arbitrary segment
  depth, invalid cycles, backward connections, split-edge membership, and Record
  history protection.

Deliverable: UI-independent graph behavior that can safely support every edit the
prototype exposes.

### Phase 2 - Layout and projection

- Implement deterministic nine-rank forward-upward placement for the reference
  fixture, with responsive world-to-screen transforms.
- Keep user-edited horizontal positions, depth ranks, inline edge positions, and
  curve bends in the layout document.
- Implement the five semantic levels, segment-tree traversal, center-sensitive
  optional detail, label budgets, and Record eligibility.
- Derive summary connections from hidden canonical paths, including ordered
  endpoint-outcome sections and factual hidden counts.
- Derive segment corridors/badges for the focused Road at the current level.
- Add previous-projection stability and deterministic tie-breaking.
- Test overview, each semantic level, different pan centers at equal zoom,
  summary expansion, endpoint style derivation, Record attachment, and compact
  viewports.

Deliverable: a deterministic read model for every static prototype state before
interactive UI work begins.

### Phase 3 - Route finding and camera commands

- Implement route search from any planned node, with unreachable destinations
  represented explicitly.
- Return a stable route, failed-endpoint count, required semantic level, and fit
  bounds.
- Implement pure camera helpers for anchored zoom, pan, fit-to-route, focus above
  an open bottom sheet, clamping, and reset.
- Test competing routes, ties, cycles rejected by domain, unreachable nodes,
  zoom-anchor preservation, and safe-area/control exclusions.

Deliverable: application-level directions and testable camera math.

### Phase 4 - Runtime adapters and composition

- Implement in-memory semantic and layout repositories seeded with the portrait
  fixture.
- Make snapshot and layout updates atomic from the application service's point of
  view.
- Implement the runtime facade/provider in `src/ui/composition/**`.
- Expose load, retry, empty, and typed error states to the UI.
- Keep durable persistence out of this cycle; document that restart restores the
  fixture.

Deliverable: a replaceable runtime boundary with no UI-to-infrastructure imports.

### Phase 5 - Static portrait rendering

- Build the safe-area screen, compact header, map canvas, hierarchy controls,
  camera controls, mode switch, hint, and toast.
- Render roads and corridors with `react-native-svg`; render nodes as accessible
  React Native press targets over the same world transform.
- Port the warm paper/forest/gold/sage/violet visual tokens and compact labels.
- Match Start, Goal, Task, Checkpoint, and Record silhouettes without depending
  on color alone.
- Implement selected, active-route, muted, failed-blocker, summary, and filtered
  states.
- Respect reduced motion and maintain at least 44-point interactive hit areas
  even where the visible marker is smaller.

Deliverable: screenshot-comparable static states for levels 0 through 4 on the
reference viewport and a smaller supported viewport.

### Phase 6 - Visual mode

- Add pan, pinch, wheel, double-tap/double-click, hierarchy controls, and anchored
  camera `+`/`-` controls through platform-specific gesture adapters.
- Add node, connection, and segment selection with a detail sheet that keeps the
  selected item visible above it.
- Add legend filters and camera reset.
- Add route search, origin selection, result metadata, active-route fit/emphasis,
  header summary, and clear action.
- Make summary-road selection descend one semantic level around the selected
  corridor.

Deliverable: complete read-only exploration and directions behavior.

### Phase 7 - Edit mode and Record capture

- Add the session reducer and cancellation rules for selection, drafts, sheets,
  active routes, and mode changes.
- Add node dragging with depth guide/snapping and fixed-origin depth.
- Add Record dragging as layout-only movement with target preserved.
- Add path-handle creation, nearest-target highlighting, forward validation, and
  new connected-node composer.
- Add long-press blank creation, segment-local creation, edge insertion, edge
  bend editing, node editing, and live previews.
- Add outcome cycling and ensure all incoming edges reproject from the endpoint.
- Add safe delete/archive flows and reset-layout behavior.
- Add Record capture with target suggestion, required text, direct attachment,
  and automatic move to evidence level.

Deliverable: every bounded authoring workflow in the prototype, backed by domain
commands rather than UI mutation.

### Phase 8 - Verification and handoff

- Add domain, application, repository, session-reducer, and UI contract tests.
- Add interaction tests for mode switching, selection, route search, composer
  validation, outcome changes, delete confirmation, and Record targeting.
- Manually verify iOS portrait and Expo web for touch, mouse, wheel, keyboard,
  safe areas, small height, and reduced motion.
- Compare captured states against the HTML reference for all semantic levels,
  an active route, each bottom sheet, Edit mode, and Record evidence.
- Run `npm run check` and an Expo web export/bundle smoke test.
- Write `docs/cycles/portrait-road-map/cycle-report.md` with implemented behavior,
  screenshots, verification commands, deviations, and deferrals.

Deliverable: a checked implementation with evidence tied to this plan.

## Acceptance matrix

| Behavior | Automated evidence | Manual evidence |
| --- | --- | --- |
| One permanent origin and forward-upward directed graph | Domain invariant and cycle tests | Level 0 screen |
| Five nested segment levels | Projection fixtures for levels 0-4 | Control-by-control review |
| Summary roads preserve hidden endpoint outcomes | Summary section/order tests | Mixed green/todo/failed summary |
| Shape and outcome are independently recognizable | UI props/accessibility tests | Success/todo/failed marker review |
| Pan and anchored continuous zoom | Camera math tests | Touch, wheel, and mouse review |
| Pan affects optional local disclosure at equal zoom | Projection center tests | Compare Health and Work centers |
| Route search prefers clear paths, then shorter paths | Route cost/tie tests | Active route header and fit |
| Node/edge/segment detail remains visible above sheet | Focus-camera tests | Bottom-sheet review |
| Editor cannot create backward paths or cycles | Domain command tests | Drag-handle error feedback |
| Edge insertion preserves reachability and membership | Split transaction tests | Before/after editor review |
| Endpoint outcome updates all incoming edge styles | Projection tests | Multi-incoming node review |
| Record attaches only to selected Goal or Task | Domain and capture tests | Evidence-level review |
| Deletion cannot silently erase Record history | Archive/delete tests | Destructive confirmation review |
| UI never imports repository/infrastructure adapters | dependency-cruiser | `npm run check` |

## Dependencies and implementation choices

- Keep `react-native-svg` for roads, arrows, corridors, blockers, and draft paths.
- Add Expo-compatible `react-native-gesture-handler` and `react-native-reanimated`
  only if the built-in responder/Animated APIs cannot provide stable two-finger
  and simultaneous gestures on both native and web. Record the decision before
  Phase 5 rather than mixing gesture systems mid-implementation.
- Avoid a bottom-sheet dependency unless accessibility, focus management, and
  native/web parity cannot be met with the existing animation stack.
- Use deterministic IDs supplied by an application clock/ID port in tests; do not
  use `Date.now()` inside domain logic.

## Explicit deferrals

- cloud sync, authentication, sharing, backup, and durable local persistence;
- a general Road/segment hierarchy editor, Road reparenting, and drag-to-reorder
  of segment trees;
- branch `ALL`/`ANY` completion logic and aggregate percentage progress;
- automatic Task completion or Status changes when a Record is captured;
- an actual-history route or Updated Status entity;
- unrestricted cross-scope relationships that cannot be represented truthfully;
- advanced graph optimization beyond deterministic layered placement and the
  editable bends shown in the prototype;
- landscape/tablet-specific information architecture beyond a centered,
  max-width portrait canvas.

## Risks and controls

- **Prototype/domain mismatch:** resolve it in Phase 0 and encode the result in
  tests before UI work.
- **Gesture conflicts:** keep mode-specific recognizers, minimum movement
  thresholds, long-press cancellation, and pure state transitions.
- **Graph corruption during edits:** make every mutation transactional and validate
  the complete resulting aggregate before save.
- **Misleading outcome colors:** derive every incoming edge from the endpoint's
  single outcome and keep connection meaning separately accessible.
- **Stale summaries after edits:** derive summaries and counts from the canonical
  graph on every accepted projection; never increment stored summary counters.
- **Dense visual clutter:** budget labels separately, keep segment overlays focused
  to one Road, and retain center-sensitive contraction.
- **Cross-platform SVG differences:** centralize geometry, use non-scaling stroke
  equivalents where possible, and compare native/web screenshots.
- **Record loss:** archive referenced targets or require an explicit history-aware
  destructive choice.

## Definition of done

The implementation is complete when all Phase 0 decisions are recorded, every
prototype workflow listed in this plan is either implemented or explicitly
approved as a deviation, the acceptance matrix has evidence, `npm run check` and
the Expo bundle smoke test pass, and the cycle report accurately describes the
workspace.
