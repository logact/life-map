# Segment-driven layers cycle report

Source plan: [`../../exec-plans/segment-driven-layers/plan.md`](../../exec-plans/segment-driven-layers/plan.md)

## Implemented

- **Containment is now a domain invariant** (`LifeMap.validate`): a child
  segment's `memberNodeIds`/`connectionIds` must be drawn from its parent's
  pools, so "deepest containing segment" is unambiguous. `createNode` with a
  `segmentId` files the node into every ancestor segment to uphold it, and
  `createSubSegmentForConnection` only nests under a segment whose pool holds
  the connection *and* both endpoints. The portrait fixture already complied;
  two tests that created escaping segments were corrected.
- **`dissolveSegment`** (`LifeMap.ts`, exposed via `EditLifeMap` + runtime):
  rejects road roots, promotes children to the dissolved segment's parent
  (merging pools, deduped), and releases members of standalone segments —
  parentless children become standalone roots with road affiliation cleared
  down their subtrees.
- **`moveNodeToSegment`** (`LifeMap.ts`, exposed via `EditLifeMap` + runtime):
  adds the node to the target and its ancestors, removes it from every other
  segment of the target road's tree (so its layer becomes exactly the
  target's depth), and drops connection entries whose endpoints are no longer
  both members. Cross-road moves are rejected; nodes in no road tree (unfiled)
  may be filed into any road. `reparentSegment` is now an application command.
- **Membership-based visibility** (`PortraitMapProjectionService`): a node's
  layer is the depth of its deepest segment within the focused road's tree;
  level *L* shows `layer ≤ L`. `stageOneRanks` and the level-0 `maxRank` rule
  are deleted — `depthRank` is purely vertical placement. The permanent origin
  and node focus overrides stay; unfiled and other-road nodes surface at
  layer 0. The `level < 2` gate on summaries is gone, so hidden chains bridge
  at every level and vanish on their own once nothing is hidden.
- **Route zoom follows filing** (`FindRoadService`): `requiredSemanticLevel`
  is now the deepest layer a route touches within the featured road's tree
  (the permanent origin never raises it), replacing the rank-band copy.
- **Acceptance fixture** (`__tests__/application/Projection.test.ts`):
  `a1→…→c3` with the skeleton filed in the root, milestones one level deep,
  detail two levels deep — L0 shows `{Start, a1, b1, c1}` with summaries
  `a1→b1` (sections success/failed/success) and `b1→c1`, L1 adds
  `{a2, b2, c2}`, L2 shows the full chain with zero summaries. A second
  fixture covers parallel hidden branches merging into one summary per
  boundary pair.
- **UI organizing flows**: segment detail sheets offer **Dissolve segment**
  (disabled at the road root); node detail sheets in edit mode list the
  focused road's segments as **Move to layer** chips grouped by depth
  (`runtime.segmentOptions`, loaded alongside node options). `MapHint` copy
  now reads "pinch through layers".
- **Spec update** (`docs/specification/life-map.md`): the display contract
  table is the curated-layer contract, containment is a canonical invariant,
  dissolve/reparent/membership moves are in scope, and only cross-road moves
  remain deferred.

## Verification

- `npm run check` — typecheck clean; dependency-cruiser: 39 modules, no
  violations; Jest: 15 suites, 109 tests, all passing.
- `npx expo export --platform web` — web bundle builds cleanly.

## Deviations

- **`moveNodeToSegment` clears the whole tree, not just the old branch.** The
  plan's "old branch below the LCA" wording leaves sibling-branch memberships
  in place, but siblings can share a node (the fixture files `choose` into two
  sibling segments), which would leave the node at its old layer. The op
  removes every membership in the target road's tree outside the target's
  ancestor chain, guaranteeing the node's deepest container is the target.
- **Outside-tree nodes are layer 0, not rank-based.** Open decision 1
  recommended keeping rank-based visibility for nodes outside the focused
  road's tree, but decision 6 deletes the rank rules; with no rank policy left,
  outside-tree nodes take the same default as unfiled nodes (layer 0). This
  keeps the map's non-focused roads fully visible as context at every level.
- **No new session/reducer actions.** Dissolve and move-to-layer are one-tap
  mutations (unlike grouping's multi-tap mode), so the planned reducer tests
  became sheet and screen tests instead.
- **Demo seed unchanged.** The portrait seed files every featured-road node at
  layer 4, so levels 0–3 now render identically for that road (Start plus the
  other roads, with one studio bridge summary). Structuring the seed's
  hierarchy to showcase curated layers is a content decision left for a
  follow-up.

## Remaining deferrals

Unchanged from the plan's open decisions and the base cycles: durable
persistence and sync, cross-road segment moves, branch completion semantics,
automatic completion from Records, actual-history routes, landscape/tablet
layouts.

## Post-cycle amendments

- **2026-09-03 — Segment chips and segment editing UI removed.** The tappable
  segment title chips rendered empty tags when members were hidden by their
  layer, so the map no longer draws segments at all. Grouping mode, the segment
  detail sheet, and the dissolve button went with them; segments are now an
  organizing structure only (layer membership + creation drop zones). In-map
  organizing is the connection sub-segment action and the node sheet's **Move
  to layer** list. The domain/application ops (`groupIntoSubSegment`,
  `dissolveSegment`, `reparentSegment`, `moveNodeToSegment`) remain as tested
  capabilities; only their UI entry points were removed.
