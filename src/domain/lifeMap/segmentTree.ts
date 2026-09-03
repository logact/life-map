import { RoadSegment } from './entities';

/**
 * The display contract supports five hierarchy levels (0–4); deeper segments
 * would never render, so authoring operations must respect this cap.
 */
export const MAX_SEGMENT_DEPTH = 4;

const indexById = (segments: RoadSegment[]): Map<string, RoadSegment> =>
  new Map(segments.map((segment) => [segment.id, segment]));

/** Length of the parent chain (a root segment has depth 0). Cycle-safe. */
export const segmentDepth = (segments: RoadSegment[], id: string): number => {
  const segmentsById = indexById(segments);
  let depth = 0;
  let current = segmentsById.get(id);
  const visited = new Set<string>();
  while (current?.parentSegmentId) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parent = segmentsById.get(current.parentSegmentId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
};

/** Longest downward chain beneath a segment (a leaf has height 0). */
export const segmentSubtreeHeight = (segments: RoadSegment[], id: string): number => {
  const childIdsByParent = new Map<string, string[]>();
  for (const segment of segments) {
    if (!segment.parentSegmentId) continue;
    childIdsByParent.set(segment.parentSegmentId, [...(childIdsByParent.get(segment.parentSegmentId) ?? []), segment.id]);
  }
  const height = (segmentId: string, ancestors: Set<string>): number => {
    if (ancestors.has(segmentId)) return 0;
    const nextAncestors = new Set(ancestors).add(segmentId);
    return (childIdsByParent.get(segmentId) ?? [])
      .reduce((tallest, childId) => Math.max(tallest, 1 + height(childId, nextAncestors)), 0);
  };
  return height(id, new Set());
};

/** Deepest segment (longest parent chain) matching a predicate; id-sorted tie-break. */
export const deepestSegmentContaining = (
  segments: RoadSegment[],
  predicate: (segment: RoadSegment) => boolean,
): RoadSegment | undefined =>
  segments
    .filter(predicate)
    .sort((left, right) => segmentDepth(segments, right.id) - segmentDepth(segments, left.id) || left.id.localeCompare(right.id))[0];
