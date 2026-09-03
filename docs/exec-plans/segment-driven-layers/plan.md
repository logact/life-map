# Segment-driven layers implementation plan

Status: **Implemented — 2026-09-03**

Implementation report: [`../../cycles/segment-driven-layers/cycle-report.md`](../../cycles/segment-driven-layers/cycle-report.md)

## Objective

Make the user-authored segment hierarchy drive layer visibility. Today the user
can group nodes/edges into nested segments, but zoom layers ignore that
structure — node visibility is hardcoded by `depthRank`. After this change:

- A node's layer is decided by which segment the user filed it in (segment
  depth = layer). Organizing the map *is* deciding what each layer shows.
- Zoom level *L* shows exactly the nodes whose segment depth ≤ *L*, with
  summary connections bridging over hidden intermediate nodes.
- The editing workflow is complete: **group** (exists), **dissolve** (new),
  **move membership** (new), **reparent** (expose existing domain op).

`MAX_SEGMENT_DEPTH` stays at 4 (five layers, 0–4); the zoom-band contract in
`src/application/map/semanticZoom.ts` is unchanged.

## Current state

- Node visibility per level is rank-based and ignores segments
  (`PortraitMapProjectionService.ts:69-76`): level 0 = permanent origin +
  `maxRank` row; level 1 = hardcoded `stageOneRanks = {0, 1, 2, 7, 8}`
  (`PortraitMapProjectionService.ts:33`); level ≥ 2 = everything.
- Segments only produce overlay frames, filtered by `depth <= level` with
  dimmed ancestors (`PortraitMapProjectionService.ts:157-190`).
- Summary connections already bridge hidden chains between visible endpoints,
  but only at `level < 2` and only scoped to the focused road's root segment
  (`PortraitMapProjectionService.ts:138-148`, `summariesForRoad` at 285-378).
  The mechanism is visibility-driven, so it should keep working once
  `visibleIds` changes — only the level gate needs to move.
- Grouping exists end-to-end: `EditLifeMap.groupIntoSubSegment`
  (`EditLifeMap.ts:144-177`), `createSubSegmentForConnection`
  (`EditLifeMap.ts:185-203`), UI grouping mode (`useLifeMapSession.ts:123-146`,
  `LifeMapScreen.tsx:445-465`).
- Domain segment ops: `createSegment` and `reparentSegment`
  (`LifeMap.ts:274-336`). There is **no dissolve**, **no membership move**, and
  `reparentSegment` is not exposed as an application command.
- Nested containment convention: child segment members are drawn from the
  parent's pool and the parent keeps them (`EditLifeMap.ts:151-162`). This is
  a convention, not a validated invariant — the layer semantics below require
  it, so it becomes an invariant.

## Design decisions

1. **Node layer = depth of the deepest segment containing it** within the
   focused road's segment tree. Root segment members are layer 0; a node
   grouped one level deeper is layer 1; etc.
2. **Containment becomes a domain invariant**: `child.memberNodeIds ⊆
   parent.memberNodeIds` and `child.connectionIds ⊆ parent.connectionIds`,
   enforced in `LifeMap.validate`. Without it "deepest containing segment" is
   ambiguous. Existing fixtures must be audited for compliance.
3. **Visibility rule**: within the focused road, a node is visible at level *L*
   iff `nodeLayer(node) <= L`. The permanent origin is always visible; the
   existing focus override stays. Nodes outside the focused road's tree keep
   the current rank-based behavior for now (open decision below).
4. **Summary bridging at every level**: remove the `level < 2` gate so hidden
   chains are bridged whenever they contain hidden nodes. At deep levels where
   nothing is hidden, no summaries are produced — no extra policy needed.
   This is what renders the user's `a1→b1→c1` skeleton over hidden `a2→a3`.
5. **Records unchanged**: still render at level 4 only
   (`PortraitMapProjectionService.ts:197`). A record whose target is hidden
   must not render — verify the existing target-visibility guard.
6. **`depthRank` is decoupled from layers**: it becomes purely vertical screen
   position. `stageOneRanks` and the level-0 `maxRank` rule are deleted.

## Work items (inward-first)

### 1. Domain — hierarchy editing ops (`src/domain/lifeMap/LifeMap.ts`)

- `dissolveSegment(segmentId)`:
  - Reject road root segments (every road needs exactly one root,
    `LifeMap.ts:140-141`).
  - Reparent the segment's children to its parent (or to standalone when the
    dissolved segment has no parent).
  - Merge `memberNodeIds`/`connectionIds` into the parent pool (dedupe);
    for standalone segments simply release them.
  - Remove the segment.
- `moveNodeToSegment(nodeId, targetSegmentId)`:
  - Add the node to the target and to every ancestor up the chain (maintains
    the containment invariant).
  - Remove it from segments on the old branch below the lowest common
    ancestor, and drop now-uncovered `connectionIds` entries accordingly.
  - Validate same-road membership (`LifeMap.ts:126`).
- Enforce the containment invariant in `validate`.
- Unit tests in `__tests__/domain/`: dissolve root rejection, child promotion,
  pool merging, membership move across branches, invariant violations.

### 2. Application — commands (`src/application/lifeMap/EditLifeMap.ts`)

- `dissolveSegment(segmentId)` and `moveNodeToSegment(nodeId, targetSegmentId)`
  via the existing `mutate` helper.
- `reparentSegment(segmentId, newParentSegmentId)` — expose the domain op as a
  command (today it is only reachable inside `groupIntoSubSegment`).
- No layout writes needed: placements are per-node and unaffected.
- Tests in `__tests__/application/`.

### 3. Projection — membership-based visibility (`PortraitMapProjectionService.ts`)

- Compute `nodeLayer` per node with the existing `deepestSegmentContaining`
  helper (`segmentTree.ts:46-52`), restricted to the focused road's tree.
- Replace the `visibleIds` filter (69-76) with `nodeLayer <= level`; delete
  `stageOneRanks` (33).
- Remove the `level < 2` gate on summary connections (138-148) so
  `summariesForRoad` runs at every level; it already derives hidden components
  from `visibleIds`.
- Acceptance fixture mirroring the user's example: road
  `a1→a2→a3→b1→b2→b3→b4→c1→c2→c3`, root segment holds `a1,b1,c1`, a depth-1
  segment adds `a2,b2,c2`, a depth-2 segment the rest. Assert:
  - level 0 shows `{Start, a1, b1, c1}` + summary bridges `a1→b1`, `b1→c1`;
  - level 1 adds `{a2, b2, c2}`;
  - level 2 shows the full chain.
- Update existing projection tests that assert rank-based visibility
  (search `__tests__` for `stageOneRanks`-era expectations, level-0/1 node
  sets, and summary-connection counts).

### 4. UI — organizing flows (`src/ui/map/**`, `src/ui/composition/createLifeMapRuntime.ts`)

- **Ungroup**: action on a selected segment in edit mode (bottom sheet,
  alongside the existing grouping entry at `LifeMapScreen.tsx:445`); disabled
  for root segments; calls `runtime.dissolveSegment`.
- **Move node to layer**: node sheet action listing the focused road's
  segments grouped by depth; calls `runtime.moveNodeToSegment`.
- Runtime wrappers in `createLifeMapRuntime.ts` next to
  `groupIntoSubSegment` (142-152).
- Update `MapHint` copy so layer readout reflects curated layers, not ranks.
- Session/reducer tests for the new actions.

### 5. Docs

- Update any design/domain docs describing rank-based levels
  (`docs/design/**`, `docs/domain/**`) to the curated-layer contract.
- `AGENTS.md` conventions are unchanged.

## Open decisions (recommended defaults chosen)

- **Nodes outside the focused road's tree**: keep current rank-based
  visibility. Recommended — keeps this change scoped to the focused road;
  revisit if multi-road layering is wanted.
- **Nodes in no segment at all** (possible via `createNode` without
  `segmentId`): treat as layer 0. Recommended — unfiled work-in-progress
  should surface early; the user can file it deeper explicitly.
- **Standalone (roadless) segments**: unchanged rendering; their members are
  outside the focused tree, so decision one applies.

## Verification

- `npm run check` (TypeScript, dependency-cruiser, Jest) must pass.
- The acceptance fixture in work item 3 is the behavioral contract for
  "the user decides which node shows in which layer".
