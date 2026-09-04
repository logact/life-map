# Route path choices cycle report

Source plan: [`../../exec-plans/route-path-choices/plan.md`](../../exec-plans/route-path-choices/plan.md)

## Implemented

- **Path enumeration** (`FindRoadService.findAll`): every simple path between
  two nodes is DFS-enumerated over the DAG (deterministic, budgeted at 256
  complete paths), ranked with the existing cost (fewest failed endpoints,
  then fewest hops), and sliced to `PATH_CHOICE_LIMIT = 8`. Each alternative
  carries its own camera bounds and required semantic level. Single-path
  `find` semantics are untouched, and `findAll`'s first row matches it.
- **Choice flow**: `runtime.findRoads` feeds `handleFindRoad`
  (`LifeMapScreen.tsx`) — 0 paths toasts as before, 1 path activates
  immediately as before, and >1 paths stores `session.pathChoices`
  (`useLifeMapSession.ts`, cleared on route activation/clear, sheet close, or
  mode switch). The route sheet (`MapBottomSheet.tsx`) swaps its search inputs
  for a ranked list — `Path N`, connection and failed-endpoint counts, and the
  via-node titles — so the user compares trade-offs and taps
  `Take path N to …` to highlight that road. "Back to search" abandons the
  choice without activating anything.

## Tests

- Application: ranked enumeration, best-first parity with `find`, single-path
  and unreachable results, limit slicing.
- Session reducer: `pathChoices` set/clear lifecycle.
- UI: end-to-end choice for the two-path marathon query (list shows both via
  routes, chosen path activates, sheet closes); the seven tests sharing that
  route preamble now tap `Take path 1` via a `showMarathonRoad` helper;
  sheet-level rendering/choose/back coverage with mocked props.

## Notes

- `Go to here` from a node sheet and search-submit flow through the same
  handler, so they offer choices automatically.
- `npm run check` passes (TypeScript, dependency-cruiser, Jest).
