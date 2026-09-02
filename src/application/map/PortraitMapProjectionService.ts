import {
  LifeMapSnapshot,
  MapLayoutSnapshot,
  Outcome,
  PlannedNode,
  Road,
  RoadSegment,
} from '../../domain/lifeMap/entities';
import { RoadLayoutService } from './RoadLayoutService';
import {
  ActiveRouteProjection,
  MapCamera,
  MapViewport,
  PortraitMapProjection,
  ProjectedConnection,
  ProjectedSummaryConnection,
  SummaryOutcomeSection,
} from './projectionTypes';

export interface ProjectionRequest {
  snapshot: LifeMapSnapshot;
  layout: MapLayoutSnapshot;
  viewport: MapViewport;
  camera: MapCamera;
  semanticLevel: number;
  focus?: { type: 'node' | 'connection' | 'segment' | 'record'; id: string };
  focusedRoadId?: string;
  outcomeFilters?: Outcome[];
  activeRoute?: ActiveRouteProjection;
  previousProjection?: PortraitMapProjection;
}

const stageOneRanks = new Set([0, 1, 2, 7, 8]);

const hierarchyLevel = (segment: RoadSegment, segments: Map<string, RoadSegment>): number => {
  let level = 0;
  let current = segment;
  const visited = new Set<string>();
  while (current.parentSegmentId) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parent = segments.get(current.parentSegmentId);
    if (!parent) break;
    level += 1;
    current = parent;
  }
  return level;
};

const compressSections = (outcomes: Array<{ outcome: Outcome; id: string }>): SummaryOutcomeSection[] => {
  const sections: SummaryOutcomeSection[] = [];
  for (const item of outcomes) {
    const previous = sections.at(-1);
    if (previous?.outcome === item.outcome) previous.connectionIds.push(item.id);
    else sections.push({ outcome: item.outcome, connectionIds: [item.id] });
  }
  return sections;
};

export class PortraitMapProjectionService {
  private readonly layoutService = new RoadLayoutService();

  project(request: ProjectionRequest): PortraitMapProjection {
    const level = Math.max(0, Math.min(4, Math.round(request.semanticLevel)));
    const nodeById = new Map(request.snapshot.nodes.map((node) => [node.id, node]));
    const placementById = new Map(request.layout.placements.map((placement) => [placement.nodeId, placement]));
    const activeNodes = request.snapshot.nodes.filter((node) => !node.archivedAt && placementById.has(node.id));
    const maxRank = Math.max(...request.layout.placements.map((placement) => placement.depthRank));
    const visibleIds = new Set(
      activeNodes.filter((node) => {
        const rank = placementById.get(node.id)!.depthRank;
        if (level === 0) return node.kind === 'originStatus' || rank === maxRank;
        if (level === 1) return stageOneRanks.has(rank);
        return true;
      }).map((node) => node.id),
    );
    if (request.focus?.type === 'node' && nodeById.get(request.focus.id) && !nodeById.get(request.focus.id)?.archivedAt) {
      visibleIds.add(request.focus.id);
    }

    const optionalLabelIds = new Set(
      [...visibleIds]
        .filter((id) => nodeById.get(id)?.kind !== 'originStatus' && nodeById.get(id)?.kind !== 'goal')
        .sort((left, right) => {
          const leftX = placementById.get(left)?.worldX ?? 0;
          const rightX = placementById.get(right)?.worldX ?? 0;
          return Math.abs(leftX - request.camera.centerX) - Math.abs(rightX - request.camera.centerX) || left.localeCompare(right);
        })
        .slice(0, level === 0 ? 0 : 4),
    );
    const filters = new Set<Outcome>(request.outcomeFilters ?? ['success', 'todo', 'failed']);
    const activeRouteNodes = new Set(request.activeRoute?.nodeIds ?? []);
    const activeRouteConnections = new Set(request.activeRoute?.connectionIds ?? []);

    const nodes = activeNodes
      .filter((node) => visibleIds.has(node.id))
      .sort((left, right) => {
        const rank = (placementById.get(left.id)?.depthRank ?? 0) - (placementById.get(right.id)?.depthRank ?? 0);
        return rank || left.id.localeCompare(right.id);
      })
      .map((node) => {
        const placement = placementById.get(node.id)!;
        const worldY = this.layoutService.worldY(placement);
        const screen = this.layoutService.worldToScreen({ x: placement.worldX, y: worldY }, request.viewport, request.camera);
        return {
          id: node.id,
          title: node.title,
          description: node.description,
          kind: node.kind,
          outcome: node.outcome,
          worldX: placement.worldX,
          worldY,
          depthRank: placement.depthRank,
          showLabel: level >= 2 || node.kind === 'originStatus' || node.kind === 'goal' || optionalLabelIds.has(node.id),
          filtered: !filters.has(node.outcome),
          onActiveRoute: activeRouteNodes.has(node.id),
          ...screen,
        };
      });
    const projectedNodeById = new Map(nodes.map((node) => [node.id, node]));

    const connections: ProjectedConnection[] = request.snapshot.connections
      .filter((connection) => visibleIds.has(connection.fromNodeId) && visibleIds.has(connection.toNodeId))
      .map((connection) => {
        const target = nodeById.get(connection.toNodeId)!;
        return this.projectConnection(
          connection,
          target.outcome,
          projectedNodeById.get(connection.fromNodeId)!,
          projectedNodeById.get(connection.toNodeId)!,
          request,
          !filters.has(target.outcome),
          activeRouteConnections.has(connection.id),
        );
      });

    const summaryConnections = level < 2
      ? request.snapshot.roads.flatMap((road) => this.summariesForRoad(
        road,
        request,
        visibleIds,
        nodeById,
        placementById,
        projectedNodeById,
        filters,
      ))
      : [];

    const segmentById = new Map(request.snapshot.segments.map((segment) => [segment.id, segment]));
    const focusedRoadId = request.focusedRoadId
      ?? (request.focus?.type === 'segment' ? segmentById.get(request.focus.id)?.roadId : undefined)
      ?? request.snapshot.roads.find((road) => road.featured)?.id
      ?? request.snapshot.roads[0]?.id;
    const segmentOverlays = request.snapshot.segments
      .filter((segment) => segment.roadId === focusedRoadId && hierarchyLevel(segment, segmentById) === level)
      .map((segment) => {
        const points = segment.memberNodeIds.flatMap((id) => {
          const placement = placementById.get(id);
          if (!placement) return [];
          return [this.layoutService.worldToScreen(
            { x: placement.worldX, y: this.layoutService.worldY(placement) },
            request.viewport,
            request.camera,
          )];
        });
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const padding = 20;
        return {
          id: segment.id,
          roadId: segment.roadId,
          title: segment.title,
          description: segment.description,
          tone: segment.tone,
          hierarchyLevel: level,
          memberCount: segment.memberNodeIds.length,
          bounds: {
            x: Math.min(...xs) - padding,
            y: Math.min(...ys) - padding,
            width: Math.max(40, Math.max(...xs) - Math.min(...xs) + padding * 2),
            height: Math.max(40, Math.max(...ys) - Math.min(...ys) + padding * 2),
          },
        };
      });

    const recordPlacementById = new Map(request.layout.recordPlacements.map((placement) => [placement.recordId, placement]));
    const recordAttachments = level === 4 ? request.snapshot.records.flatMap((record) => {
      const target = projectedNodeById.get(record.targetId);
      const recordPlacement = recordPlacementById.get(record.id);
      if (!target || !recordPlacement) return [];
      const from = this.layoutService.worldToScreen(
        { x: recordPlacement.worldX, y: recordPlacement.worldY },
        request.viewport,
        request.camera,
      );
      return [{
        id: record.id,
        targetId: record.targetId,
        summary: record.summary,
        content: record.content,
        occurredAt: record.occurredAt,
        from,
        to: { x: target.x, y: target.y },
        filtered: !filters.has(nodeById.get(record.targetId)!.outcome),
      }];
    }) : [];

    const featuredRoad = request.snapshot.roads.find((road) => road.featured) ?? request.snapshot.roads[0];
    const childCount = request.snapshot.segments.filter((segment) => segment.parentSegmentId === featuredRoad?.rootSegmentId).length;
    const routeFrom = request.activeRoute ? nodeById.get(request.activeRoute.nodeIds[0]) : undefined;
    const routeTo = request.activeRoute ? nodeById.get(request.activeRoute.nodeIds.at(-1) ?? '') : undefined;
    const headerSummary = request.activeRoute
      ? {
        title: `${routeFrom?.title ?? 'Start'} → ${routeTo?.title ?? 'Destination'}`,
        detail: `${request.activeRoute.connectionIds.length} connections · ${request.activeRoute.failedEndpointCount} failed endpoint${request.activeRoute.failedEndpointCount === 1 ? '' : 's'}`,
        activeRoute: true,
      }
      : {
        title: featuredRoad?.title ?? 'Life Map',
        detail: `${childCount} segments`,
        activeRoute: false,
      };

    return {
      nodes,
      connections,
      summaryConnections,
      segmentOverlays,
      recordAttachments,
      headerSummary,
      diagnostics: {
        semanticLevel: level,
        visibleNodeIds: [...visibleIds].sort(),
        hiddenNodeIds: activeNodes.map((node) => node.id).filter((id) => !visibleIds.has(id)).sort(),
        optionalLabelNodeIds: [...optionalLabelIds].sort(),
        summaryCount: summaryConnections.length,
        worldCenter: { x: request.camera.centerX, y: request.camera.centerY },
      },
    };
  }

  private projectConnection(
    connection: { id: string; fromNodeId: string; toNodeId: string; meaning: string },
    outcome: Outcome,
    fromNode: { x: number; y: number },
    toNode: { x: number; y: number },
    request: ProjectionRequest,
    filtered: boolean,
    onActiveRoute: boolean,
  ): ProjectedConnection {
    const bend = request.layout.bends.find((candidate) => candidate.connectionId === connection.id);
    return {
      ...connection,
      outcome,
      from: { x: fromNode.x, y: fromNode.y },
      to: { x: toNode.x, y: toNode.y },
      control: {
        x: (fromNode.x + toNode.x) / 2 + (bend?.offsetX ?? 0) * request.camera.scale,
        y: (fromNode.y + toNode.y) / 2 + (bend?.offsetY ?? 0) * request.camera.scale,
      },
      filtered,
      onActiveRoute,
    };
  }

  private summariesForRoad(
    road: Road,
    request: ProjectionRequest,
    visibleIds: Set<string>,
    nodeById: Map<string, PlannedNode>,
    placementById: Map<string, MapLayoutSnapshot['placements'][number]>,
    projectedNodeById: Map<string, { x: number; y: number }>,
    filters: Set<Outcome>,
  ): ProjectedSummaryConnection[] {
    const root = request.snapshot.segments.find((segment) => segment.id === road.rootSegmentId);
    if (!root) return [];
    const rootNodeIds = new Set(root.memberNodeIds);
    const rootConnections = request.snapshot.connections.filter((connection) => root.connectionIds.includes(connection.id));
    const hidden = new Set([...rootNodeIds].filter((id) => !visibleIds.has(id) && !nodeById.get(id)?.archivedAt));
    const components: string[][] = [];
    while (hidden.size) {
      const seed = [...hidden].sort()[0];
      const component: string[] = [];
      const queue = [seed];
      hidden.delete(seed);
      while (queue.length) {
        const id = queue.shift()!;
        component.push(id);
        for (const connection of rootConnections) {
          const neighbor = connection.fromNodeId === id ? connection.toNodeId
            : connection.toNodeId === id ? connection.fromNodeId : undefined;
          if (neighbor && hidden.has(neighbor)) {
            hidden.delete(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(component.sort());
    }
    return components.flatMap((component) => {
      const componentIds = new Set(component);
      const incomingBoundaries = rootConnections
        .filter((connection) => componentIds.has(connection.toNodeId) && visibleIds.has(connection.fromNodeId))
        .map((connection) => connection.fromNodeId);
      const outgoingBoundaries = rootConnections
        .filter((connection) => componentIds.has(connection.fromNodeId) && visibleIds.has(connection.toNodeId))
        .map((connection) => connection.toNodeId);
      const fromNodeId = [...new Set(incomingBoundaries)].sort((left, right) =>
        (placementById.get(left)?.depthRank ?? 0) - (placementById.get(right)?.depthRank ?? 0) || left.localeCompare(right),
      )[0];
      const toNodeId = [...new Set(outgoingBoundaries)].sort((left, right) =>
        (placementById.get(right)?.depthRank ?? 0) - (placementById.get(left)?.depthRank ?? 0) || left.localeCompare(right),
      )[0];
      const from = projectedNodeById.get(fromNodeId);
      const to = projectedNodeById.get(toNodeId);
      if (!fromNodeId || !toNodeId || !from || !to) return [];
      const covered = rootConnections
        .filter((connection) =>
          componentIds.has(connection.fromNodeId) || componentIds.has(connection.toNodeId),
        )
        .sort((left, right) =>
          (placementById.get(left.toNodeId)?.depthRank ?? 0) - (placementById.get(right.toNodeId)?.depthRank ?? 0)
          || left.id.localeCompare(right.id),
        );
      const sections = compressSections(covered.map((connection) => ({
        id: connection.id,
        outcome: nodeById.get(connection.toNodeId)!.outcome,
      })));
      const outcome = sections.some((section) => section.outcome === 'failed') ? 'failed'
        : sections.some((section) => section.outcome === 'todo') ? 'todo' : 'success';
      const projected = this.projectConnection(
        {
          id: `summary:${road.id}:${fromNodeId}:${toNodeId}`,
          fromNodeId,
          toNodeId,
          meaning: `summarizes ${road.title}`,
        },
        outcome,
        from,
        to,
        request,
        sections.every((section) => !filters.has(section.outcome)),
        covered.some((connection) => request.activeRoute?.connectionIds.includes(connection.id)),
      );
      return [{
        ...projected,
        kind: 'summary' as const,
        roadId: road.id,
        segmentId: road.rootSegmentId,
        hiddenNodeIds: component,
        hiddenConnectionIds: covered.map((connection) => connection.id),
        hiddenCount: component.length,
        sections,
      }];
    });
  }
}
