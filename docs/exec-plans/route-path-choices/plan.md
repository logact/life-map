# Route path choices implementation plan

Status: **Implemented — 2026-09-04**

Implementation report: [`../../cycles/route-path-choices/cycle-report.md`](../../cycles/route-path-choices/cycle-report.md)

## Objective

After querying a road from a start node to an end node, when more than one
path exists the user **chooses the path**: the route sheet lists all found
paths ranked best-first with per-path stats and via-node titles, and tapping
one highlights that path on the map. Confirmed UX: list of paths in the sheet
(no on-map cycling).

## Current state (before)

- `FindRoadService.find` returns the single best path (cost: failed endpoints,
  hop count, lexicographic connection key). The connection graph is a
  domain-guaranteed DAG, so simple-path enumeration is safe.
- `handleFindRoad` activates that path immediately: `show-route` + camera fit
  + toast; the route sheet closes.

## Changes

### 1. `src/application/map/FindRoadService.ts`

`findAll(snapshot, layout, from, to, limit = PATH_CHOICE_LIMIT = 8)`:
DFS-enumerates simple paths (deterministic, adjacency sorted by connection
id), budgeted at 256 complete paths, ranked with the existing `compare`,
sliced to `limit`, each mapped through the existing `result()` helper so every
path carries its own bounds and required semantic level. `find` is unchanged.

### 2. `src/ui/composition/createLifeMapRuntime.ts`

`findRoads(from, to): Promise<RoadSearchResult[]>` delegating to `findAll`.

### 3. `src/ui/map/useLifeMapSession.ts`

`pathChoices?: RoadSearchResult[]` state + `set-path-choices` action; cleared
on `show-route`, `clear-route`, `close-sheet`, `set-mode`.

### 4. `src/ui/map/LifeMapScreen.tsx`

`handleFindRoad` splits into find + `activateRoute`: 0 paths → unreachable
toast; 1 path → activate immediately (today's behavior); >1 →
`set-path-choices` and the sheet stays open. `onChoosePath` activates the
chosen path; `onClearPathChoices` returns to search.

### 5. `src/ui/map/MapBottomSheet.tsx`

When `session.pathChoices` is set, the route sheet replaces the search inputs
with the ranked list (`Path N`, connection/failed counts, via titles,
`Take path N to {end}` labels) plus a "Back to search" button.

## Tests

- `FindRoad.test.ts`: ranked enumeration, best-first matches `find`, single
  path, unreachable → `[]`, limit slicing.
- `SessionReducer.test.ts`: `pathChoices` lifecycle.
- `LifeMapScreen.test.tsx`: choice list appears for the 2-path marathon query
  and the chosen path activates; shared `showMarathonRoad` helper taps
  `Take path 1` in the seven tests using that route preamble.
- `MapBottomSheet.test.tsx`: choice list rendering, choose, back-to-search.

## Verification

`npm run check` passes.
