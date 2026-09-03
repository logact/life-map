# Edge extraction on tap implementation plan

Status: **Implemented — 2026-09-03**

Implementation report: [`../../cycles/edge-extraction/cycle-report.md`](../../cycles/edge-extraction/cycle-report.md)

## Objective

Let the user select any visible edge between two arbitrary nodes and **extract**
it: the connection and both endpoint nodes are filed into their own deeper
sub-segment, so the current zoom level collapses the edge to the abstract
summary line and the next level reveals the two nodes plus the selected edge.

Edges are hard to hit directly, so an edge can also be selected by tapping its
two endpoint nodes on the map: the first tap arms a pending start endpoint
(and selects the node as usual), the second tap resolves the edge between
them. Direction doesn't matter — either endpoint order resolves. If no edge
connects the two nodes, the second tap silently stays a plain node select and
re-arms the pending start. A blank canvas tap or mode switch cancels the
pending start.

Decisions confirmed with the user:

- **Persist** the extraction (file into a sub-segment — saved map data), not a
  transient view.
- Trigger **automatically on edge tap in edit mode**; visual mode keeps its
  current tap-to-select behavior.
- After extraction the detail sheet **reopens on the extracted edge**, keeping
  bend/insert/delete reachable.

## Current state (before)

- `EditLifeMap.createSubSegmentForConnection` (`src/application/lifeMap/EditLifeMap.ts`)
  already files a connection + both endpoints into a new child of the deepest
  eligible segment (standalone segment fallback for unfiled/cross-road
  connections). Filing raises the endpoints' layer
  (`PortraitMapProjectionService`), so hidden chains collapse into summary
  connections with no projection changes.
- The flow is only reachable from the edit-mode connection detail sheet via
  the "Create sub-segment from this connection" button
  (`MapBottomSheet.tsx`), followed by `stepIntoSegment`
  (`LifeMapScreen.tsx`) to descend the camera.

## Changes

### 1. `src/ui/composition/createLifeMapRuntime.ts` — `extractConnection`

New composition method: returns the id of the segment holding the extracted
connection. If a segment already files this connection as its sole connection
with both endpoints as members, that segment is reused; otherwise the existing
`createSubSegmentForConnection` runs. The guard prevents redundant nesting
when an already-extracted edge is tapped again — with the stock seed every
leaf connection already sits in an atomic depth-4 segment, so this is the
common case.

### 2. `src/ui/map/LifeMapScreen.tsx` — edit-mode tap extracts

In the canvas `onSelect` handler, a connection tap in edit mode now runs
`extractConnection` through `runMutation` (toast + reload), calls
`stepIntoSegment` to descend into the segment's layer, and finally re-
dispatches `select` so the detail sheet opens on the extracted edge. Summary
taps and visual-mode taps are untouched.

### 2a. Two-tap endpoint edge selection

The same `onSelect` handler intercepts node taps: the tapped node becomes the
pending `edgeStartNodeId` in the session (`useLifeMapSession.ts`, new
`set-edge-start` action, cleared on mode switch). A second node tap looks up
the visible connection between the pending start and the tapped node (either
direction) and, when found, converts the selection into a connection
selection — so in edit mode the extraction flow runs, in visual mode the edge
detail sheet opens. When no such edge exists the tap falls through to a plain
node select and the tapped node becomes the new pending start, so browsing
nodes never produces error noise. The blank-canvas `onTap` clears a pending
start without disturbing the double-tap zoom detection. The edit-mode
`MapHint` copy mentions the gesture.

### 3. `src/ui/map/MapBottomSheet.tsx` — drop the redundant button

"Create sub-segment from this connection" and its
`onCreateSubSegmentForConnection` prop are removed: in edit mode any
connection shown in the sheet arrived there via an extracting tap, so the
button could only re-run the guard.

### 4. Tests

- `__tests__/ui/LifeMapScreen.test.tsx`:
  - fresh extraction (seed minus the atomic r5 segment): tap extracts, toast,
    sheet reopens (sheet-specific metadata + bend buttons), deep-level overlay
    titled `Build weekly base → Run three times`, and a second tap on the
    extracted edge creates no duplicate segment.
  - already-extracted edge (stock seed): tapping r5 files nothing —
    `segmentOptions` is unchanged before/after.
  - two-tap endpoint selection: tapping `Build weekly base` then
    `Run three times` extracts r5 in edit mode and selects it in visual mode;
    a second endpoint tap with no shared edge stays a plain node select; a
    blank canvas tap cancels the pending start.
  - visual mode: tapping a connection opens the detail sheet without toasting
    or filing anything.
- `__tests__/ui/MapBottomSheet.test.tsx`: the connection detail sheet no
  longer offers the extraction button.

### 5. Verification

`npm run check` (TypeScript + dependency-cruiser + Jest).

## Edge cases

- Extraction works for any visible edge: unfiled endpoints, cross-road bridges
  (standalone segment fallback — persisted but visually level-neutral), and
  edges anchored at the permanent origin.
- Edges hidden at the current level can't be tapped (not rendered).
- `MAX_SEGMENT_DEPTH = 4` is respected by the existing parent-selection
  filter; the reuse guard keeps repeat taps from growing the tree.
- Edge long-press in edit mode (insert-node composer) is unchanged.
