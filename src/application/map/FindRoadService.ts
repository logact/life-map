import { LifeMapSnapshot, MapLayoutSnapshot, Outcome } from '../../domain/lifeMap/entities';
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

export class FindRoadService {
  private readonly layoutService = new RoadLayoutService();

  find(snapshot: LifeMapSnapshot, layout: MapLayoutSnapshot, fromNodeId: string, toNodeId: string): FindRoadResult {
    const activeNodes = new Map(snapshot.nodes.filter((node) => !node.archivedAt).map((node) => [node.id, node]));
    if (!activeNodes.has(fromNodeId) || !activeNodes.has(toNodeId)) {
      return { status: 'unreachable', fromNodeId, toNodeId };
    }
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
      if (current.nodeId === toNodeId) return this.result(snapshot, layout, current, fromNodeId, toNodeId);
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
    return { status: 'unreachable', fromNodeId, toNodeId };
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
      return placement ? [{ x: placement.worldX, y: this.layoutService.worldY(placement), rank: placement.depthRank }] : [];
    });
    const stageOneRanks = new Set([0, 1, 2, 7, 8]);
    const requiredSemanticLevel = points.every((point) => point.rank === 0 || point.rank === 8)
      ? 0
      : points.every((point) => stageOneRanks.has(point.rank)) ? 1 : 2;
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
