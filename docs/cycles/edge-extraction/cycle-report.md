# Edge extraction cycle report

Source plan: [`../../exec-plans/edge-extraction/plan.md`](../../exec-plans/edge-extraction/plan.md)

## Implemented

- **Tap-to-extract in edit mode** (`LifeMapScreen.tsx`): tapping an edge in
  edit mode now files the connection and both endpoint nodes into their own
  deeper sub-segment (persisted), so the current zoom level collapses the edge
  to the abstract summary line while the camera steps into the new segment's
  layer and reveals the two nodes plus the selected edge. The detail sheet
  reopens on the extracted edge, so bend/insert/delete stay reachable.
  Visual-mode taps keep the previous select + detail sheet behavior, and
  summary (abstract line) taps still zoom in.
- **`runtime.extractConnection`** (`createLifeMapRuntime.ts`): composition
  method that returns the segment holding the extracted connection. It reuses
  an existing segment that already files the connection as its sole connection
  with both endpoints, delegating to the unchanged
  `EditLifeMap.createSubSegmentForConnection` domain flow otherwise. The reuse
  guard matters because the seed already files every leaf connection into an
  atomic depth-4 segment — repeat taps can never nest redundant segments, and
  `MAX_SEGMENT_DEPTH = 4` stays respected.
- **Redundant button removed** (`MapBottomSheet.tsx`): "Create sub-segment
  from this connection" and its prop wiring are gone; in edit mode the sheet
  only ever shows connections that arrived via an extracting tap.
- **Two-tap endpoint edge selection** (`LifeMapScreen.tsx`,
  `useLifeMapSession.ts`): thin edges no longer need a direct hit — tapping a
  node arms it as the pending start endpoint (`edgeStartNodeId` session
  state), and tapping a second node resolves the visible edge between them in
  either direction. In edit mode that selection runs the extraction flow; in
  visual mode it opens the edge detail sheet. A second tap with no shared
  edge silently stays a plain node select and re-arms the start, so browsing
  nodes never errors. Blank canvas taps and mode switches cancel the pending
  start; the edit-mode `MapHint` copy advertises the gesture.

## Tests

- `LifeMapScreen.test.tsx`: fresh extraction end-to-end (seed without the
  atomic r5 segment — tap, toast, reopened sheet, deep-level overlay
  `Build weekly base → Run three times`, repeat tap creates no duplicate);
  already-extracted edge with the stock seed files nothing; visual mode taps
  select without extracting; two-tap endpoint selection extracts in edit mode
  and selects in visual mode; a second endpoint tap with no shared edge stays
  a plain node select; a blank canvas tap cancels the pending start.
- `MapBottomSheet.test.tsx`: the connection detail sheet no longer offers the
  extraction button.

## Notes

- Extracting a connection no segment contains (fresh connections, cross-road
  bridges) still produces a standalone segment — persisted, but visually
  level-neutral, matching the existing domain behavior.
- `npm run check` passes (TypeScript, dependency-cruiser, Jest).
