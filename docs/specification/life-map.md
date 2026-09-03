# Life Map product specification

Status: **Canonical for the portrait road-map cycle — 2026-09-02**

This document supersedes product claims in the historical implementation plan and
report. The portrait prototype is the interaction and visual reference; the
historical requirements remain the safety reference for Records and route
integrity.

## Product decisions

1. Planned points have one `status` kind. The map has exactly one permanent
   status node — the origin, presented as **Start** — distinguished by permanence,
   not by a separate kind. Intermediate status-like planned points are ordinary
   `status` nodes. There is no Updated Status entity. *(Amended 2026-09-03:
   merged the former distinct `OriginStatus` and `Checkpoint` kinds.)*
2. The five-level segment hierarchy is global. Panning never changes canonical
   topology or the selected hierarchy level, but it changes optional label and
   local-detail disclosure within that level.
3. A planned node owns one outcome: `success`, `todo`, or `failed`. Every incoming
   connection derives its outcome presentation from its endpoint. Connection
   meaning remains separate and does not own an independent completion state.
4. Progress copy is factual. Headers use counts such as `4 segments`; aggregate
   percentages remain deferred until branch completion semantics exist.
5. A Goal or Task referenced by a Record cannot be silently deleted. The safe
   destructive action archives that target, removes it from active topology, and
   preserves the Record's exact historical target.
6. This cycle includes bounded in-map authoring: planned-point creation and
   editing, forward connections, edge insertion and bend adjustment, placement,
   outcome changes, safe deletion/archive, and Record capture. *(Amended
   2026-09-03: bounded segment authoring is now included — a connection can
   spawn a sub-segment, and a node can be filed into any layer of its road.
   The five-level depth cap is enforced. Dissolve, reparent, and membership
   moves are domain/application capabilities; the in-map surface is
   deliberately limited to those two flows. Cross-road moves remain deferred.)*

## Canonical model and invariants

- Planned kinds are Status, Goal, and Task. Records are evidence and are never
  planned nodes.
- Exactly one active Status node is the permanent origin, presented as Start; it
  has no incoming connection.
- Canonical connections form a directed acyclic graph. Screen coordinates never
  determine semantic direction.
- A Record directly targets one existing Goal or Task. Moving its marker is a
  layout-only operation and cannot change its target.
- A Road names one Goal destination and one rooted, arbitrarily deep segment
  tree. Child segments stay within their parent's Road, and a child segment's
  member nodes and connections are drawn from its parent's pools (containment).
- Segment membership references existing planned nodes and canonical
  connections. Synthetic summaries are projection-only and are never saved.
- Edge splitting, graph edits, and Record capture validate the complete proposed
  snapshot before it replaces repository state.
- Semantic topology and editable layout are stored as separate documents.

## Display contract

The reference world is a forward-upward road map; depth ranks place markers
vertically and never decide visibility. A point's layer is the depth of its
deepest segment within the focused road's tree — the user's filing *is* the
layering. Points outside that tree (unfiled or filed in another road) surface
at layer 0, and the permanent origin is always visible. The layout responds
to the actual safe-area viewport and camera; `390 × 844` is a reference, not a
hard-coded device frame. Supported targets for this cycle are iOS portrait and
Expo web. The smallest supported portrait viewport is `320 × 568` points.

| Level | Planned content | Summaries | Records |
| --- | --- | --- | --- |
| 0 | Start, unfiled points, and points whose deepest filing is the root corridor | Factual summary roads | Hidden |
| 1 | …plus points filed one segment deep | Local summaries | Hidden |
| 2 | …plus points filed two segments deep | Local summaries | Hidden |
| 3 | …plus points filed three segments deep | Local summaries | Hidden |
| 4 | All planned nodes and canonical connections | None needed | Direct evidence attachments |

Summary roads bridge hidden chains at every level: whenever a hidden run of
nodes sits between visible endpoints, one summary carries its ordered
endpoint-outcome sections and exact hidden coverage. At levels where nothing
is hidden, no summaries are produced.

Segments are an organizing structure, not map ink: they decide each point's
layer and catch blank-space creation drops, but they are never drawn.

Summary roads preserve ordered endpoint-outcome sections and expose their exact
hidden node and connection coverage. Outcome filters mute matching planned
points, incoming roads, summaries, and attached Records without changing data.

## Interaction contract

Visual mode supports pan, anchored continuous zoom, independent hierarchy
controls, selection/detail sheets, outcome filters, camera reset, and route
search. Route cost prefers fewer failed endpoints, then fewer connections, then
stable ID order. An active route reports cost metadata and supplies fit bounds.

Edit mode keeps drafts in UI session state until a command is committed. Planned
nodes snap vertically to depth ranks; Start remains at rank zero. Forward path
handles connect a reachable higher-rank point or open a connected-node composer.
Blank-space long press creates an isolated point, or a segment-local point when
the press lands inside a current-level segment frame. A selected connection can
spawn a sub-segment covering that edge, and a selected node files into any layer
of the focused road. Connection
detail can insert a node, and a selected curve exposes a bend handle. Deletion
requires an armed second action.

Runtime persistence is intentionally in-memory for this cycle. Restarting the app
restores the deterministic portrait fixture.

## Deferred

Cloud sync, authentication, sharing, durable persistence, cross-road segment
moves, branch `ALL`/`ANY` completion, aggregate percentages, automatic
completion from Records, actual-history routes, and landscape/tablet
information architecture are outside this specification.
