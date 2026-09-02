# Life Map — Core Product Requirements

> Historical source requirements. The canonical MVP specification for future plans is [`docs/specification/life-map.md`](docs/specification/life-map.md).

**Product:** Becoming  
**Prototype:** https://becoming-dashboard.lo2gact.chatgpt.site

## Core idea

The Life Map is one zoomable map of the user’s life. It helps the user understand:

1. Where am I now?
2. Where do I want to go?
3. What is the planned path toward that goal?
4. What have I actually done for the plan?

It should feel like Google Maps: zoom out to understand the whole landscape, then zoom in around a chosen center to reveal local detail.

## Core concepts

| Concept | Meaning | Map role |
| --- | --- | --- |
| **Status** | The user’s actual current or starting environment | The “You are here” origin |
| **Goal** | A target state the user wants to reach | A destination or checkpoint |
| **Task** | An executable step planned to implement a Goal | A step on the planned route |
| **Record** | What the user actually did or observed | A small real trace attached to a Task or Goal |

Important rules:

- Status is only the starting point. Do not show an “Updated Status” node after Records.
- A Goal can contain unlimited levels of smaller Goals before reaching Tasks.
- A Record must connect directly to the Task or Goal it documents.
- Records are not planned route steps and do not create a separate route.

## Map structure

- Becoming has one global Life Map, not one separate map for each Goal.
- The planned direction is:

  `Status → Goal → Subgoal → … → Task → Goal`

- The exact depth is flexible. Different branches may have different numbers of Goals, Subgoals, and Tasks.
- Every path has direction, shown with arrowheads pointing toward its target.
- Edges have meaning, such as “implements,” “depends on,” “prerequisite for,” or “records.”
- When intermediate detail is hidden, the edge summarizes it—for example: “4 hidden steps · 65%.”
- Zooming into that edge reveals the hidden Goals or Tasks.

## Semantic zoom

Zoom changes the meaning and amount of visible information, not only its geometric size.

### Zoomed out

Show:

- the current Status;
- the most important root Goals; and
- major planned routes.

### Medium zoom

Show the Goals and Subgoals around the zoom center. Hidden parts of other branches remain summarized inside their edges.

### Close zoom

Show executable Tasks, dependencies, preparation, and constraints for the focused local Goal.

### Closest zoom

Show small Records attached directly to their related Task or Goal.

The zoom center is essential. Zooming near Health should reveal Health details; zooming near Work at the same zoom level should reveal Work details.

## Visual language

Entity type must be recognizable without reading the title and without depending only on color.

| Entity | Appearance | Relative size |
| --- | --- | --- |
| **Status** | Pale sage location pill with a map pin | Medium |
| **Goal** | Gold destination shape with a flag | Largest |
| **Task** | Dark-green directional shape with an arrow | Medium |
| **Record** | Violet folded-note shape | Smallest |

Edges:

- **Planned path:** amber dashed line with arrowhead.
- **Real Record:** green solid thin line from the Record to its Task or Goal.
- **Structural relation:** violet dotted line with arrowhead.

Nodes and labels must be compact when zoomed out and grow gradually as the user zooms in. They must not cover the map routes.

## Main interactions

- Drag to pan.
- Pinch, scroll, or use `+` and `−` to zoom.
- Double-tap or double-click to zoom toward that point.
- Tap a Goal, Task, Record, or edge to focus and reveal more detail.
- Provide a control to fit the whole Life Map.
- Use a full-screen map without a persistent bottom navigation bar.
- Keep the global Capture button at the bottom-right.
- When Capture is opened from a focused Goal or Task, suggest that entity as the new Record’s relationship target.

## Product acceptance criteria

The Life Map is successful when:

1. The overview clearly shows “where I am” and the main Goal destinations.
2. Goal, Task, and Record nodes are immediately distinguishable.
3. Nodes are small enough to feel like map features rather than large cards.
4. Planned paths clearly point from Status toward Goals.
5. Panning changes the semantic center and therefore changes which content zoom reveals.
6. Goal branches support any depth instead of a fixed number of layers.
7. Hidden detail is summarized inside meaningful edges and expands when zoomed.
8. Records appear only at close detail and attach directly to a Task or Goal.
9. No Updated Status node or separate actual route appears.
10. The user can pan, zoom, inspect entities, and Capture without leaving the full-screen map.
