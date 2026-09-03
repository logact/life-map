import { LifeMapSnapshot, MapLayoutSnapshot, Outcome } from '../../domain/lifeMap/entities';
import { segmentDepth } from '../../domain/lifeMap/segmentTree';
import { RoadLayoutService } from './RoadLayoutService';

export interface RoadSearchResult {
  status: 'found';
  fromNodeId: string;
  toNodeId: string;
  nodeIds: string[];
  connectionIds: string[];
  failedEndpointCount: number;
  requiredSemanticLevel: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface UnreachableRoadSearchResult {
  status: 'unreachable';
  fromNodeId: string;
  toNodeId: string;
}

export type FindRoadResult = RoadSearchResult | UnreachableRoadSearchResult;

export interface RoadPreview {
  toNodeId: string;
  connectionCount: number;
  failedEndpointCount: number;
}

interface Candidate {
  nodeId: string;
  nodeIds: string[];
  connectionIds: string[];
  failed: number;
  key: string;
}

const compare = (left: Candidate, right: Candidate): number =>
  left.failed - right.failed ||
  left.connectionIds.length - right.connectionIds.length ||
  left.key.localeCompare(right.key);

const searchFrom = (snapshot: LifeMapSnapshot, fromNodeId: string): Map<string, Candidate> => {
  const activeNodes = new Map(snapshot.nodes.filter((node) => !node.archivedAt).map((node) => [node.id, node]));
  const outgoing = new Map<string, typeof snapshot.connections>();
  for (const connection of [...snapshot.connections].sort((a, b) => a.id.localeCompare(b.id))) {
    const values = outgoing.get(connection.fromNodeId) ?? [];
    values.push(connection);
    outgoing.set(connection.fromNodeId, values);
  }
  const start: Candidate = { nodeId: fromNodeId, nodeIds: [fromNodeId], connectionIds: [], failed: 0, key: '' };
  const queue: Candidate[] = [start];
  const best = new Map<string, Candidate>();
  while (queue.length) {
    queue.sort(compare);
    const current = queue.shift()!;
    const known = best.get(current.nodeId);
    if (known && compare(known, current) <= 0) continue;
    best.set(current.nodeId, current);
    for (const connection of outgoing.get(current.nodeId) ?? []) {
      const target = activeNodes.get(connection.toNodeId);
      if (!target || current.nodeIds.includes(target.id)) continue;
      const connectionIds = [...current.connectionIds, connection.id];
      queue.push({
        nodeId: target.id,
        nodeIds: [...current.nodeIds, target.id],
        connectionIds,
        failed: current.failed + (target.outcome === 'failed' ? 1 : 0),
        key: connectionIds.join('/'),
      });
    }
  }
  best.delete(fromNodeId);
  return best;
};

export class FindRoadService {
  private readonly layoutService = new RoadLayoutService();

  /** Best route cost to every reachable destination in one pass, for live search previews. */
  previewAll(snapshot: LifeMapSnapshot, fromNodeId: string): RoadPreview[] {
    if (!snapshot.nodes.some((node) => node.id === fromNodeId && !node.archivedAt)) return [];
    return [...searchFrom(snapshot, fromNodeId).values()].map((candidate) => ({
      toNodeId: candidate.nodeId,
      connectionCount: candidate.connectionIds.length,
      failedEndpointCount: candidate.failed,
    }));
  }

  find(snapshot: LifeMapSnapshot, layout: MapLayoutSnapshot, fromNodeId: string, toNodeId: string): FindRoadResult {
    const isActive = (id: string) => snapshot.nodes.some((node) => node.id === id && !node.archivedAt);
    if (!isActive(fromNodeId) || !isActive(toNodeId)) {
      return { status: 'unreachable', fromNodeId, toNodeId };
    }
    const best = searchFrom(snapshot, fromNodeId);
    const candidate = best.get(toNodeId);
    if (!candidate) return { status: 'unreachable', fromNodeId, toNodeId };
    return this.result(snapshot, layout, candidate, fromNodeId, toNodeId);
  }

  private result(
    snapshot: LifeMapSnapshot,
    layout: MapLayoutSnapshot,
    candidate: Candidate,
    fromNodeId: string,
    toNodeId: string,
  ): RoadSearchResult {
    const placements = new Map(layout.placements.map((placement) => [placement.nodeId, placement]));
    const points = candidate.nodeIds.flatMap((nodeId) => {
      const placement = placements.get(nodeId);
      return placement ? [{ x: placement.worldX, y: this.layoutService.worldY(placement) }] : [];
    });
    // The route must zoom to the deepest layer it touches within the default
    // focused (featured) road's tree. The permanent origin and nodes outside
    // that tree are visible from level 0 and never raise the requirement.
    const focusedRoadId = snapshot.roads.find((road) => road.featured)?.id ?? snapshot.roads[0]?.id;
    const permanent = new Set(snapshot.nodes.filter((node) => node.permanent).map((node) => node.id));
    const routeNodes = new Set(candidate.nodeIds);
    let requiredSemanticLevel = 0;
    for (const segment of snapshot.segments) {
      if (segment.roadId !== focusedRoadId) continue;
      if (!segment.memberNodeIds.some((id) => routeNodes.has(id) && !permanent.has(id))) continue;
      requiredSemanticLevel = Math.max(requiredSemanticLevel, segmentDepth(snapshot.segments, segment.id));
    }
    return {
      status: 'found',
      fromNodeId,
      toNodeId,
      nodeIds: candidate.nodeIds,
      connectionIds: candidate.connectionIds,
      failedEndpointCount: candidate.failed,
      requiredSemanticLevel,
      bounds: {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
      },
    };
  }
}

export const outcomeWeight = (outcome: Outcome): number => outcome === 'failed' ? 2 : outcome === 'todo' ? 1 : 0;
