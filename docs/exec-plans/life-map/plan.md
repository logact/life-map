# Life Map implementation plan

Status: **Historical architecture reference — the described source is absent from this workspace**

> Historical note: this document and its linked report describe an earlier cycle,
> but the implementation files they name are not present in the current checkout.
> Use the canonical [`docs/specification/life-map.md`](../../specification/life-map.md)
> and the portrait road-map plan for current product and implementation truth.

Implementation report: [`cycle-1/cycle-report.md`](../../cycles/cycle-1/cycle-report.md)

Source requirements: [`life-map-development-requirements.md`](../../../life-map-development-requirements.md)

## Objective

Build a runnable Expo/React Native Life Map MVP with one global, pannable map that answers:

1. Where am I now?
2. Which Goals am I moving toward?
3. Which planned routes, intermediate Goals, and Tasks lead there?
4. Which Records show what I actually did?

The implementation will adapt the engineering conventions of the sibling `becoming` project: inward-pointing layers, repository ports, an explicit composition root, architecture checks, tests, and secret-free CI. It will not copy product-specific domain code, identifiers, credentials, or release configuration.

This plan intentionally separates the canonical recursive plan from the density-aware map projection. A structural parent/child relationship makes content eligible for display; it does not require every sibling node to be rendered at the same time.

## Agreed product decisions

### Canonical plan structure

- The product has one global map and exactly one current `Status` origin.
- `Status`, `Goal`, and `Task` are planned map points. A `Goal` may be a destination, an intermediate milestone, a prerequisite, or the starting point for another Goal.
- “Pre-goal” and “start goal” are contextual roles, not additional entity types.
- A directed `PlanSegment` connects two planned points and always points toward the destination or dependent outcome.
- Any `PlanSegment A → B` may own one recursive `RefinementScope` whose boundary is the same `A` and `B`.
- Every planned point has one home scope. A child scope references its inherited boundary points by ID rather than duplicating them.
- A refinement may contain Goals, Tasks, directed connections, splits, and merges. Any child segment may itself be refined.
- Each refinement scope is a directed acyclic graph. The refinement-containment relationship is also acyclic.
- Branches currently mean only different planned paths toward the Goal. `BranchGroup`, `ALL`/`ANY` completion logic, and route-level completion percentages are deferred.
- Until branch completion semantics exist, collapsed summaries use factual counts such as `3 routes · 4 goals · 7 tasks · 12 records`, not an ambiguous aggregate percentage.

### Records

- A `Record` represents what the user actually did or observed.
- Every Record has exactly one direct target: a `Goal` or a `Task`.
- A Record is not a planned route point, has no `parentSegmentId`, and never creates an “actual route” or “Updated Status.”
- Creating a Record does not automatically complete a Task or change Status. Any completion action must be separate and explicit.
- Records follow their target in the display projection. They never get visually retargeted to a collapsed parent.

### Display projection

- `scopeId` and `parentSegmentId` define structural membership and recursive eligibility, not a fixed visual layer.
- Zoom, viewport center, focus, importance, available screen space, and prior visibility determine the displayed subset.
- Selection is budgeted and connectivity-preserving. The renderer must not simply take the top `N` independent nodes.
- Hidden connected regions between visible boundaries become synthetic summary connections. Hidden terminal regions with no visible destination boundary become synthetic terminal summary nodes or stubs. Both exist only in the application read model and are never persisted as canonical entities or relationships.
- Connections are derived after node/fragment selection. A visible node must retain understandable route context through real or summary connections.
- Records have a separate evidence budget and become eligible only when their target is visible at close zoom or explicitly focused.

## Architecture

```text
App.tsx
  → ui/map/LifeMapScreen
       → application/map/MapProjectionService
       → application/map/MapLayoutService
       → application/record/CaptureRecordService
            → domain/lifeMap/LifeMapRepository
                 ← infrastructure/memory/MemoryLifeMapRepository
```

Layer direction:

```text
ui → application → domain
                 ↑
          infrastructure
```

- `domain` owns entities, relationships, repository ports, and invariants. It has no React Native, Expo, SQLite, or UI dependencies.
- `application` owns use cases, layout contracts, projection policies, display scoring, graph contraction, and read models.
- `infrastructure` implements repository ports and runtime state adapters.
- `ui` renders application outputs and sends interaction commands. It does not traverse repositories or canonical graphs directly.
- `src/ui/composition/**` is the only UI area allowed to instantiate infrastructure adapters and application services.
- Dependency-cruiser rules enforce inward dependencies and the composition-root exception.

## Proposed domain model

The exact names may be refined during domain tests, but the model must preserve these boundaries:

```ts
type PlannedPoint = Status | Goal | Task;

interface Status {
  id: string;
  scopeId: string;
  title: string;
  importance: number;
}

interface Goal {
  id: string;
  scopeId: string;
  title: string;
  importance: number;
}

interface Task {
  id: string;
  scopeId: string;
  title: string;
  importance: number;
}

interface RefinementScope {
  id: string;
  parentSegmentId?: string; // absent only for the global root scope
  boundaryFromId?: string;
  boundaryToId?: string;
}

interface PlanSegment {
  id: string;
  scopeId: string;
  fromId: string;
  toId: string;
  meaning: "progressesTo" | "prerequisiteFor" | "implements" | "contributesTo";
}

interface RecordEntry {
  id: string;
  targetType: "goal" | "task";
  targetId: string;
  occurredAt: string;
  summary: string;
  content?: string;
}
```

Layout information is separate from semantic entities:

```ts
interface MapPlacement {
  pointId: string;
  worldX: number;
  worldY: number;
}
```

Domain invariants:

- exactly one Status exists, with no incoming planned segment;
- the root scope has no parent segment;
- every non-root refinement has exactly one parent segment and matching boundary endpoints;
- a segment has at most one active refinement;
- each planned point has one home scope, while refinement boundaries reference existing points without copying them;
- every refinement contains at least one directed path from its source boundary to its target boundary;
- every internal planned point lies on at least one route from the source boundary to the target boundary;
- every active root-scope planned point is reachable from Status;
- planned topology and refinement containment are acyclic;
- no planned segment has a Record endpoint;
- every Record targets an existing Goal or Task directly;
- planned connections do not cross refinement boundaries; a cross-scope relationship belongs in the lowest common containing scope;
- stable IDs and explicit archive behavior preserve historical Record targets.

No `Goal.parentGoalId` tree will be used as the authoritative route model. Recursive decomposition is expressed by refinement scopes and directed segments. A separate conceptual ownership relation can be added later only if the product needs organization independent of route order.

## Map projection contract

### Inputs

```ts
interface ProjectionRequest {
  graph: LifeMapSnapshot;
  placements: MapPlacement[];
  viewport: {
    centerX: number;
    centerY: number;
    widthPx: number;
    heightPx: number;
    scale: number;
    fitScale: number;
  };
  zoomAnchor?: { worldX: number; worldY: number };
  focus?: { type: "node" | "segment" | "record"; id: string };
  previousProjection?: MapProjection;
  displayPolicy: DisplayPolicy;
}
```

### Outputs

The application returns a render-ready model rather than exposing the canonical graph to the UI:

```ts
interface MapProjection {
  nodes: ProjectedNode[];
  summaryNodes: SummaryProjectedNode[];
  segments: Array<RealProjectedSegment | SummaryProjectedSegment>;
  recordStacks: ProjectedRecordStack[];
  records: ProjectedRecord[];
  semanticCenter: ProjectedFocus;
}
```

Summary projections include their real coverage for focus, expansion, counts, testing, and accessibility:

```ts
interface SummaryProjectedNode {
  kind: "summary";
  id: string;
  scopeId: string;
  hiddenNodeIds: string[];
  hiddenSegmentIds: string[];
  hiddenGoalCount: number;
  hiddenTaskCount: number;
  hiddenRecordCount: number;
}

interface SummaryProjectedSegment {
  kind: "summary";
  fromVisibleNodeId: string;
  toVisibleNodeId: string;
  hiddenNodeIds: string[];
  hiddenSegmentIds: string[];
  hiddenGoalCount: number;
  hiddenTaskCount: number;
  hiddenRecordCount: number;
}
```

### Projection pipeline

1. **Establish semantic center.** Use explicit focus first; otherwise use the zoom anchor or viewport center and the nearest meaningful route corridor.
2. **Determine eligible detail.** Use zoom scale and recursive scope depth to decide which Goals, Tasks, refinements, and Records may compete for display.
3. **Reserve mandatory context.** Preserve Status and root destinations at overview, focused content, active refinement boundaries, and any junctions required for route closure.
4. **Create reveal candidates.** A candidate is a node or connected graph fragment plus the connections needed to explain it; it is not an isolated shape.
5. **Score candidates.** Include focus, center and route affinity, importance, explanation gain, semantic role, stability, and deterministic tie-breaking.
6. **Estimate display cost.** Include node footprint, label footprint, incident connections, collision risk, edge crossings, and platform viewport size.
7. **Select within budgets.** Prefer high value per display cost while satisfying connectivity and collision constraints. Maintain separate node, connection-density, label, and Record budgets.
8. **Contract hidden regions.** Replace every maximal hidden route region between visible boundaries with a meaningful synthetic summary connection; use a terminal summary node or stub when no visible destination boundary exists.
9. **Project Records.** Show a count or folded-note stack when a visible target becomes locally eligible; reveal individual Records only at the closest level or explicit focus.
10. **Stabilize the result.** Use previous visibility, separate enter/exit thresholds, stable ordering, and focus pinning to prevent flicker.

### Detailed projection stages

#### 1. Determine eligible detail

Eligibility answers “which canonical content may compete for space?” It does not make that content visible yet.

Start by deriving a device-independent relative zoom:

```ts
const relativeZoom = viewport.scale / viewport.fitScale;
const zoomDetail = Math.log2(relativeZoom);
```

The initial `DisplayPolicy` uses hysteretic semantic bands. The exact boundaries remain configurable and will be calibrated in the projection simulator; representative starting bands are:

| Band | Representative relative zoom | Newly eligible content |
| --- | --- | --- |
| Overview | `1×–2×` | Status, important root Goals, and root route summaries |
| Goal detail | `2×–4×` | Goals and refinement scopes near the semantic center |
| Execution detail | `4×–8×` | Tasks, local dependencies, preparation, and constraints |
| Evidence detail | `8×+` | Record counts, stacks, and then individual Records |

The semantic band changes which presentation types are eligible; it does not create physical screen space. Do not assign guessed node or connection counts to a band. Derive the display budget from the current usable viewport and measured presentation footprints.

```ts
interface DisplayBudget {
  usableBoundsPx: Rect;
  maximumMarkerCoverageRatio: number;
  maximumLabelCoverageRatio: number;
  maximumLineInkRatio: number;
  maximumCrossingsPerRegion: number;
  maximumRecordCoverageRatio: number;

  // Calibrated emergency performance guards, not display targets.
  hardMarkerCap?: number;
  hardConnectionCap?: number;
  hardRecordCap?: number;
}
```

Calculate usable bounds after excluding safe areas, map controls, the Capture button, and required margins. Measure every candidate in screen space using its actual SVG marker, interaction area, selected label variant, and required separation:

```ts
const usableAreaPx = area(displayBudget.usableBoundsPx);

const markerSlot = inflate(
  union(markerBoundsPx, interactionBoundsPx),
  policy.minimumMarkerSeparationPx,
);
const representativeMarkerSlotAreaPx = area(markerSlot);

const estimatedMarkerCapacity = Math.floor(
  (usableAreaPx * displayBudget.maximumMarkerCoverageRatio) /
    representativeMarkerSlotAreaPx,
);
```

`estimatedMarkerCapacity` is a diagnostic estimate, not the selection rule. The selector uses actual candidate rectangles and may stop earlier because of local collisions.

Budget dimensions are evaluated separately:

- **Markers:** reject or downgrade candidates whose inflated marker/interaction bounds produce unacceptable overlap.
- **Labels:** track occupied label rectangles and total label-area coverage independently; downgrade to marker-only before hiding a useful node.
- **Connections:** evaluate line ink per screen region, route separation, and predicted crossings. A fixed connection count is only an emergency performance guard because a few crossing routes can be less readable than many short parallel routes.
- **Records:** use the available evidence-lane area around the exact target. Show a stack when individual notes do not fit.
- **Controls:** treat their screen rectangles as unavailable placement regions rather than allowing map items underneath them.

Zoom affects the projected spacing between world points, so the same geometry policy may naturally fit more local detail after zooming. A higher semantic band normally replaces broad summaries with local detail; it does not try to fill a larger arbitrary count quota.

No numeric hard caps or coverage ratios are approved before marker and label dimensions exist. Establish them during Phase 3 using this calibration procedure:

1. Choose the smallest supported viewport as the reference and document its safe-area and control exclusions.
2. Measure every marker, compact marker, label, summary, Record stack, and individual Record variant using representative and worst-case text.
3. Run sparse, wide, deep, crossing-heavy, and Record-heavy fixtures through collision-aware projection.
4. Increase density until one of the readability conditions fails: entity types are no longer distinguishable, route direction cannot be followed, labels collide, or the intended item cannot be targeted reliably.
5. Select the largest policy values that pass those conditions across all reference fixtures.
6. Validate the resulting policy on larger viewports and scale it from usable area without exceeding the same coverage and line-density ratios.
7. Record the measured rationale beside every resulting ratio or safety cap. Until this calibration is completed, its value remains `TBD`, not a guessed implementation constant.

Within a semantic band, compute continuous local eligibility rather than making the whole viewport switch at once:

```ts
const centerAffinity = clamp01(
  1 - screenDistanceToSemanticCenter / policy.localityRadiusPx,
);

const effectiveDetail =
  zoomDetail +
  centerAffinity * policy.centerDetailBonus +
  focusLineageBonus;
```

Each scope and presentation type has a required detail threshold. Representative offsets are:

```text
Goal marker          scope threshold
Task marker          scope threshold + 0.50
Node label           marker threshold + 0.35
Record count         target threshold + 0.75
Record stack         target threshold + 1.50
Individual Records   target threshold + 2.25
```

These offsets are display-policy inputs, not domain facts. They let a focused local area gain detail before an equally deep but distant area at the same camera scale.

Use separate enter and exit boundaries, such as entering Goal detail at `2.1×` but returning to Overview only below `1.8×`. This prevents a small pinch or wheel movement from repeatedly changing visibility.

Scope eligibility is determined as follows:

1. The root scope is structurally eligible at every zoom.
2. Calculate a recursive depth allowance from relative zoom. A starting rule is one additional refinement depth per approximate doubling of relative zoom.
3. Establish the semantic anchor from explicit focus, then the zoom anchor, then the planned point or route corridor nearest the viewport center; fall back to Status if no route is near the viewport.
4. Make the focused or center-selected corridor’s ancestor scopes eligible up to the depth allowance. “Center-selected” is a geometric display decision and does not desig5. Allow adjacent scopes intersecting the inner focus region to become optional candidates only if budget remains. Do not expand unrelated off-center scopes merely because they have the same structural depth.
nate a canonical primary path. Preserve every eligible ancestor needed for a valid chain from root context to local detail.
6. Require the parent segment or child-scope bounds to intersect the viewport plus a small prefetch margin. Offscreen content is culled before scoring.
7. Require enough projected screen length or area to present at least one child marker and its route context. If the parent corridor is still too small, retain its summary even when recursive depth would otherwise allow expansion.
8. Apply entity-type gates: important root Goals may compete in Overview, nested Goals in Goal detail, Tasks in Execution detail, and Records in Evidence detail. A lower-band Goal, Task, or Record remains represented by its containing summary rather than becoming a disconnected marker.
9. Explicit focus pins the focused item’s ancestor chain. If it cannot fit at the current scale, the interaction recenters or zooms toward it instead of violating density constraints.
10. Preserve prior eligibility until the appropriate exit threshold is crossed.

The stage returns an inspectable result for tests and simulator diagnostics:

```ts
interface EligibilityResult {
  semanticBand: "overview" | "goal" | "execution" | "evidence";
  semanticCenter: { worldX: number; worldY: number };
  entries: Array<{
    id: string;
    kind: "scope" | "node" | "label" | "recordCount" | "recordStack" | "record";
    eligible: boolean;
    effectiveDetail: number;
    requiredDetail: number;
    reasons: string[];
  }>;
}
```

This design gives equal zoom different results at different centers: Health’s scope chain may be eligible while Work remains represented by its root summary.

#### 2. Reserve mandatory context

Mandatory context is selected before optional scoring. It prevents the budget algorithm from returning important but isolated nodes.

Use three deliberately small priority tiers:

**P0 — cannot be removed by ranking**

- the explicitly focused Goal or Task;
- both endpoints of a focused segment;
- a focused Record plus its exact Goal or Task target;
- the active Capture target;
- Status in the fitted Overview state required by the product acceptance criteria.

**P1 — required structural context**

- visible source and target boundaries of the active refinement being inspected;
- endpoints of the selected summary connection during expansion;
- the nearest planned point or route corridor around the semantic anchor;
- split or merge junctions required to distinguish reserved route corridors;
- a boundary continuation marker when a required endpoint lies outside the viewport.

**P2 — retain when space permits**

- important root Goal destinations that are inside the Overview viewport;
- the nearest meaningful predecessor and successor around the focused item;
- shallow ancestor summaries connecting local detail toward Status and its destination Goal;
- previously visible anchors whose removal would make the map jump, provided they remain within the exit threshold.

Reservation rules:

1. Insert P0 content first, then reserve its marker and connection costs.
2. Insert the minimum P1 set needed to explain direction and route membership; add P2 only while budget remains.
3. Do not force far-offscreen Status or Goals into a panned viewport. Use route continuation stubs; the fitted Overview remains the state that guarantees all main anchors.
4. A Record can never be mandatory without its actual target. Focusing a Record first reserves the target, then the Record.
5. If mandatory content exceeds a normal budget, degrade presentation in this order:
   1. hide low-priority labels;
   2. use compact marker variants;
   3. remove P2 content;
   4. contract P1 paths into summary projections;
   5. retain P0, the exact Record target, and the minimum active boundaries.
6. Mandatory content is not ranked against ordinary candidates. Its cost is deducted before optional selection.
7. Do not reserve every root Goal or every node on a path. Hidden bounded regions use summary connections; hidden terminal destinations use terminal summary nodes or route stubs such as `9 hidden goals`.
8. Give P2 a small policy cap so retained overview/stability context cannot consume the entire optional-candidate budget.

The result is a small connected skeleton that optional candidates can enrich.

#### 3. Create reveal candidates

The selection algorithm ranks reveal operations, not isolated canonical nodes. A reveal operation describes what new information appears, what route context it requires, and what summary it replaces.

```ts
interface RevealCandidate {
  id: string;
  kind:
    | "node"
    | "routeFragment"
    | "refinement"
    | "labelUpgrade"
    | "recordStack"
    | "recordItems";
  scopeId: string;
  introducedNodeIds: string[];
  introducedSegmentIds: string[];
  boundaryNodeIds: string[];
  requiredCandidateIds: string[];
  replacedSummaryCoverageIds: string[];
  features: CandidateFeatures;
  presentationVariants: DisplayCostVariant[];
}
```

Candidate generation follows these rules:

1. Begin at the frontier between the mandatory skeleton and eligible hidden content.
2. For a meaningful Goal or Task, create a candidate containing that node and the minimal incoming/outgoing route context needed to connect it to already reserved or potentially summarized boundaries.
3. Treat an inseparable split/merge junction as one small `routeFragment` candidate so its branches are not shown as unrelated floating lines.
4. Create a `refinement` candidate when replacing a parent summary with the first useful seed or small connected fragment of child-scope detail. Do not reveal every child in the scope. The parent active connection and child active connections are mutually exclusive.
5. Create marker-only and labeled presentation variants rather than making the label a requirement for displaying the node.
6. Create at most one `recordStack` candidate per eligible visible target. Create only a bounded number of dependent `recordItems` candidates ordered by `occurredAt`.
7. Express dependencies explicitly: a child refinement depends on its ancestor scope chain; a label depends on its marker; Records depend on their exact target.
8. Deduplicate overlapping candidates and calculate their marginal additions against already selected content. Two candidates sharing a segment pay for it only once.
9. Preserve distinct branch corridors when combining them would invent a connection that is not present in the canonical graph.
10. Generate at most one basic candidate per eligible node and junction from local graph frontiers rather than enumerating every source-to-target path, which could grow exponentially in a dense DAG.
11. Derive candidate IDs and traversal order from stable canonical IDs, never repository iteration order. Candidate generation should remain approximately linear in the eligible nodes and connections.
12. When revealing a terminal destination, replace or split its previous terminal summary node just as revealing an intermediate node splits a summary connection.

When a candidate is selected, any remaining hidden gap before or after it is represented by a synthetic summary connection. Therefore, revealing a high-value Task in the middle of a long path remains understandable:

```text
Status ── [5 hidden] ──▶ Focused Task ── [3 hidden] ──▶ Goal
```

#### 4. Score candidates

Hard mandatory content bypasses scoring. Every optional candidate receives normalized feature values from `0` to `1`. Initial weights live in `DisplayPolicy`, not in domain entities, and are tuned through fixtures rather than treated as permanent product truth.

| Feature | Meaning | Representative initial weight |
| --- | --- | ---: |
| `focusAffinity` | Graph/refinement proximity to explicit focus | `0.28` |
| `centerAffinity` | Screen-space closeness to semantic center | `0.20` |
| `routeAffinity` | Relevance to the center-selected local route corridors | `0.17` |
| `importance` | User/domain importance of the Goal or Task | `0.13` |
| `explanationGain` | Reduction in ambiguity or hidden-detail complexity | `0.10` |
| `semanticRolePriority` | Goal, junction, Task, or other role at the current band | `0.07` |
| `stability` | Candidate was visible in the previous accepted projection | `0.05` |

The representative weights sum to `1.0`. Explicit focus itself is mandatory; `focusAffinity` prioritizes useful surrounding context.

Feature definitions:

- `focusAffinity` is `1` for content directly represented by focus and decays deterministically with upstream, downstream, and refinement-lineage graph distance. It is `0` for unrelated scopes.
- `centerAffinity = 1 - clamp(distancePx / localityRadiusPx, 0, 1)` using the candidate’s nearest screen-space point.
- `routeAffinity` is high for directed corridors incident to focus or the semantic anchor, medium for sibling corridors in the same active scope, and low near unrelated viewport edges. It is derived from reachability and geometry and does not designate a domain-level primary path.
- `importance` comes from the canonical Goal or Task and is clamped to `0–1`; a fragment uses the maximum plus a bounded diversity adjustment rather than summing importance indefinitely.
- `explanationGain` is high when a Goal, junction, or Task splits a large ambiguous summary into clearer pieces. Approximate it using reduced hidden counts and reduced boundary-pair complexity.
- `semanticRolePriority` provides configurable defaults such as Goal `1.0`, junction `0.9`, and Task `0.65`. Record candidates use a separate evidence score.
- `stability` provides a modest retention bonus but can never defeat explicit focus or a substantial center change.

Compute base utility:

```ts
utility =
  0.28 * focusAffinity +
  0.20 * centerAffinity +
  0.17 * routeAffinity +
  0.13 * importance +
  0.10 * explanationGain +
  0.07 * semanticRolePriority +
  0.05 * stability;
```

Then estimate the candidate’s marginal display cost for each presentation variant:

- number and screen-area footprint of newly introduced markers;
- label rectangles and collision risk;
- newly introduced real or summary connections;
- connection length and local line density;
- estimated new edge crossings;
- Record-note or stack footprint;
- only the content not already paid for by selected candidates.

Selection uses value per marginal cost while enforcing separate hard limits:

```ts
priority = utility / Math.max(marginalDisplayCost, epsilon);
```

The greedy selection loop is deterministic:

```text
selected = P0 + minimum P1 + fitting P2
remaining budgets = policy budgets - mandatory costs

while candidates remain:
  recompute each candidate's marginal utility and cost
  discard candidates below the band's minimum utility threshold
  choose highest priority using deterministic tie-breaking
  if dependencies are selected and a presentation variant fits:
    accept its richest fitting variant
  otherwise:
    try marker-only or summarized variant, then skip

contract all remaining hidden regions into summary connections
validate route closure and Record-target visibility
```

The selector uses independent constraints for marker count/area, connection density, label area, edge crossings, and Record items. A single scalar priority orders candidates, but it cannot override those safety constraints.

Resolve selection order by quantized priority, then lower marginal cost, shallower refinement depth, and finally stable candidate ID. Round screen coordinates and scores to policy-defined precision before comparison so tiny platform floating-point differences cannot change the projection. A newly entering candidate replaces a previously visible candidate only when its utility exceeds the current candidate by a configurable switch margin, unless explicit focus or a semantic-band transition requires the change.

For individual Records, selection occurs only inside the separate evidence budget. Records attached to unrelated visible targets remain stacked. A representative evidence score is:

```ts
recordUtility =
  0.45 * targetFocusAffinity +
  0.25 * recency +
  0.20 * targetImportance +
  0.10 * stability;
```

A Record candidate can never evict P0 or P1 planned-route context.

Stage-level tests must prove:

- identical inputs produce identical eligibility, scores, and projection output;
- equal zoom with different centers changes eligible local scopes;
- focus pins the correct ancestor chain and exact Record target;
- mandatory context remains connected when optional budget is zero;
- a high-scoring middle node receives valid real or summary route context;
- changing importance predictably changes ranking without breaking route closure;
- increasing zoom at a fixed center reveals deeper local detail without dropping the focused item;
- a small zoom or pan movement inside hysteresis margins preserves the accepted projection;
- shuffled repository input order produces the same candidate order and projection;
- hidden terminal Goals produce truthful terminal summary nodes instead of false connections;
- a parent segment never appears as an active connection beside its active child refinement;
- no Record or Record stack appears without its exact visible target;
- contracted regions preserve canonical directed reachability and never invent a cross-branch path;
- marker, connection, label, and Record limits are never exceeded except for explicitly documented hard-mandatory overflow.

Important projection rules:

- Zoom increases eligible semantic detail; viewport pixels and collision constraints determine how much can actually fit.
- A larger zoom does not require an ever-growing total visible-node count. Broad summaries are replaced by local detail.
- A hidden node never leaves a broken or misleading gap. The projection supplies a summary connection or terminal summary node.
- A collapsed parent segment and its expanded child representation are never rendered as simultaneous active route connections.
- Preserve distinct route corridors when combining them into one summary would imply a canonical connection that does not exist.
- A summary connection is tappable and recenters or expands the covered region.
- At the same camera scale, Health may be detailed while Work remains summarized because their distance from the semantic center differs.
- Labels have their own budget. A compact marker can remain visible while its title waits for closer zoom or focus.
- No percentage is shown for a multi-path summary until branch completion semantics are defined.

## Record presentation

Record presentation has four states:

| State | Presentation |
| --- | --- |
| Target hidden | Record hidden; enclosing route summary may include a factual count |
| Target visible, normal detail | No individual Record; optional compact count indicator |
| Target visible, close detail | Violet folded-note stack connected to the exact target |
| Closest detail or explicit focus | Individual folded-note Records ordered by recency, each with a thin green attachment to the target |

- Planned routes remain amber and dashed with arrowheads.
- Record attachments remain thin, green, and solid so they cannot be mistaken for planned travel.
- Record positions are derived as stable offsets in an evidence lane beside the target; they are not independent route coordinates.
- Selecting a Record opens its full content in an overlay or bottom sheet without leaving the full-screen map.
- Capture from a focused Goal or Task suggests that exact entity as the target. The user confirms before saving.

## Layout strategy

Projection and layout remain separate services.

- Use stable world coordinates so semantic visibility changes do not rearrange the entire map.
- Lay out each refinement from source boundary toward target boundary using directed topological ranks and stable branch lanes.
- Allocate child refinement positions within the parent segment’s corridor while preserving the parent endpoints.
- Keep deterministic sibling ordering and stable IDs across reloads.
- Run label collision and route-crossing checks in screen space after applying the camera transform.
- Start with deterministic fixtures and a modest layered layout; avoid making a full general-purpose graph editor a prerequisite for validating semantic zoom.

## Work plan

### Phase 0 — Approval and scaffold audit

- Obtain approval for this plan and record any requested changes.
- Audit the existing uncommitted Expo skeleton against the extracted `becoming` conventions.
- Keep only relevant, secret-free configuration and placeholders; do not assume the present scaffold is verified.
- Inspect the workspace for unrelated user changes before editing.
- Assign a fresh implementation subagent to a bounded workstream after approval, with primary-agent review before integration.

Deliverable: an approved plan and an explicit inventory of scaffold files to retain, revise, or remove.

### Phase 1 — Engineering boundaries and CI

- Add root `AGENTS.md` guidance covering layer direction, inward-first feature work, repository boundaries, planning documents, and required checks.
- Finalize Expo/React Native/TypeScript scripts and Jest configuration.
- Expand dependency-cruiser rules to prevent outward imports across all layers, while allowing infrastructure construction only in the composition root.
- Add secret-free GitHub Actions CI using `npm ci` and `npm run check`.
- Add Dependabot and repository hygiene files without copying source-project credentials or release identifiers.

Deliverable: an installable skeleton whose type, architecture, and test gates run locally and in CI.

### Phase 2 — Recursive domain model

- Implement Status, Goal, Task, Record, RefinementScope, PlanSegment, typed meanings, placements, and repository ports.
- Implement construction and mutation APIs that validate scope boundaries and graph invariants transactionally.
- Support arbitrary refinement depth and uneven branch depth.
- Keep Record attachments and planned topology separate.
- Add domain fixtures for direct Tasks, intermediate Goals, split/merge paths, deep recursion, invalid cycles, cross-boundary edges, and archived Record targets.

Deliverable: runtime-independent domain code with exhaustive invariant tests.

### Phase 3 — Projection fixtures and layout contract

- Build deterministic Health and Work fixtures separated in world space to prove center-sensitive behavior.
- Build a dense same-scope fixture large enough to expose clutter, label collisions, and hidden terminal Goals that require terminal summary nodes.
- Build a deeply nested fixture and a Record-heavy target fixture.
- Define stable placement, topological rank, branch-lane, and collision contracts.
- Define the smallest reference viewport and its safe-area, controls, Capture-button, and margin exclusion regions.
- Measure marker, interaction, label, summary, Record-stack, and Record-note screen-space footprints, including representative and worst-case labels.
- Validate the proposed projection read model in headless tests before rendering UI.
- Add a development-only projection simulator that exposes zoom, center, focus, coverage ratios, collision results, and display budgets against the fixtures so scoring and contraction behavior can be reviewed before the production map UI.
- Use the simulator to derive and document initial coverage ratios and emergency hard caps. Do not commit unexplained count constants.

Deliverable: reusable fixtures, measured presentation footprints, a small projection simulator, documented calibrated budget values, and layout contracts that make projection behavior reviewable and deterministic.

### Phase 4 — Density-aware semantic projection

- Implement eligibility by semantic zoom, recursive depth, center, and focus.
- Implement mandatory context reservation, display scoring, display-cost estimation, geometry-derived budgets, and calibrated safety guards.
- Select a connected set of display candidates rather than independent top-ranked nodes.
- Contract hidden graph regions into synthetic summary connections or terminal summary nodes with factual counts and covered IDs.
- Add record-count, stack, and individual-record projections tied to visible targets.
- Add hysteresis, previous-visibility preference, stable tie-breaking, and focus pinning.
- Add application tests for equal zoom/different centers, dense scopes, label budgets, route closure, terminal summaries, summary tapping, parent-versus-child exclusivity, recursive refinement, zoom-out contraction, input-order independence, and Record eligibility.

Deliverable: a deterministic `MapProjectionService` proven against sparse, dense, deep, and Record-heavy graphs.

### Phase 5 — In-memory state and composition

- Implement one in-memory repository for the runtime prototype, application tests, and previews.
- Preserve stable IDs and archive entities referenced by Records for the lifetime of the in-memory session rather than silently deleting them.
- Test repository operations, transactional refinement updates, snapshot replacement, and invalid-data rejection.
- Construct repositories and services only inside `src/ui/composition/**`.

Deliverable: non-persistent runtime composition with a replaceable repository port and verified boundary discipline.

### Phase 6 — Full-screen interactive map

- Render the projection with compact, type-distinct SVG geometry:
  - Status: pale-sage pin pill;
  - Goal: gold destination/flag shape;
  - Task: dark-green directional shape;
  - Record: violet folded note.
- Render planned, structural, Record, and summary connections with distinct visual grammar.
- Implement drag pan, pinch/wheel zoom, `+`/`−`, double-tap/double-click zoom, focus, summary expansion, and fit-to-map.
- Reproject after viewport or focus changes without exposing repositories to UI components.
- Animate summary-to-detail transitions while holding boundary nodes stable.
- Keep labels within their own density budget and reveal suppressed labels on focus.
- Provide loading, empty, projection-error, and repository-error states.

Deliverable: an interactive global map that remains comprehensible under dense same-scope data.

### Phase 7 — Record Capture and inspection

- Add the global bottom-right Capture control.
- Suggest the focused Goal or Task as the Record target and require confirmation.
- Store the Record in the current in-memory session without changing Status or silently completing a Task.
- Reproject the target’s Record count/stack after capture.
- Allow Record focus and full-content inspection without leaving the map.

Deliverable: direct evidence capture and inspection consistent with the map model.

### Phase 8 — Verification and acceptance review

- Run `npm run typecheck`, `npm run architecture`, and Jest through `npm run check`.
- Add UI contract tests for node geometry, route styles, summaries, focus, Capture suggestion, and Record attachment.
- Profile dense projection fixtures and tune configurable budgets without embedding device-specific behavior in the domain.
- Manually inspect overview, Health-centered, Work-centered, dense-scope, close-Task, and closest-Record states on supported platforms.
- Verify every acceptance criterion and document intentional deferrals.

Deliverable: passing checks, a manual acceptance checklist, and an implementation report.

## Acceptance evidence

| Behavior | Planned evidence |
| --- | --- |
| One global map with one Status origin | Domain invariant test and overview fixture |
| Main Goals visible at overview | Projection test and screen inspection |
| Arbitrary recursive route depth | Deep-refinement domain and projection tests |
| Direct Task paths and intermediate Goals | Mixed-path fixture |
| Dense same-scope content does not flood the screen | Budget, collision, and stress-fixture tests |
| High-ranked content remains connected | Route-closure and synthetic-summary tests |
| Panning changes semantic detail at equal zoom | Health-versus-Work center tests |
| Hidden detail is summarized and expandable | Summary-connection, terminal-summary, coverage, and focus tests |
| Goal, Task, and Record shapes are distinguishable | UI contract test and visual inspection |
| Records attach only to the exact Goal or Task | Domain target invariant and projection tests |
| Hidden-target Records are not incorrectly retargeted | Collapsed-scope Record test |
| No Updated Status or actual route | Domain type and repository inspection |
| Pan, zoom, focus, fit, and Capture remain full-screen | Interaction tests and manual review |

## Risks and controls

- **Visibility flicker:** use prior-visibility preference, deterministic tie-breaking, separate enter/exit thresholds, and focus pinning.
- **Disconnected top-ranked nodes:** rank connected reveal candidates and validate route closure after selection.
- **Misleading summaries:** derive them from covered canonical IDs and never persist them as relationships.
- **Ambiguous multi-path progress:** omit aggregate percentages until branch completion semantics are designed.
- **Layout instability:** keep world positions and branch ordering stable across projection changes.
- **Dense graph performance:** use deterministic stress fixtures, screen-space indexes, memoized summaries, and profiling before increasing scope.
- **Gesture differences across platforms:** keep application projection independent of gesture adapters and manually test platform-specific input.
- **Record history loss:** archive referenced targets and preserve direct Record target IDs.

## Explicit deferrals

- `BranchGroup`, `ALL`/`ANY`/`K-of-N`, optional-route completion, and route-level progress aggregation;
- automatically treating Records as Task completion or Status updates;
- a separate actual-history route;
- unrestricted cross-scope connections that cannot be safely collapsed;
- a full Goal/Task/route authoring editor unless it is added as a separate accepted requirement;
- advanced automatic graph-layout optimization beyond the deterministic layout needed for this MVP;
- SQLite or any other durable local persistence, migrations, synchronization, and backup. Data resetting when the prototype restarts is an accepted limitation.

## Approval gate

Approved by the user's 2026-08-24 implementation request. The completed scope and verification evidence are recorded in the implementation report linked above.

## Current workspace note

The Expo MVP, inward architecture, domain model, projection/layout services, in-memory adapter, map UI, Capture flow, fixtures, tests, and CI are implemented. Persistence and release placeholders were removed because they remain explicitly deferred.
