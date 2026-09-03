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
    const segmentById = new Map(request.snapshot.segments.map((segment) => [segment.id, segment]));
    const focusedRoadId = request.focusedRoadId
      ?? (request.focus?.type === 'segment' ? segmentById.get(request.focus.id)?.roadId : undefined)
      ?? request.snapshot.roads.find((road) => road.featured)?.id
      ?? request.snapshot.roads[0]?.id;
    // A node's layer is the depth of its deepest segment within the focused
    // road's tree; the hierarchy is the user's filing, so organizing the map
    // is deciding what each zoom level shows. Points outside that tree
    // (unfiled or filed in another road) surface at layer 0.
    const nodeLayer = new Map<string, number>();
    for (const segment of request.snapshot.segments) {
      if (segment.roadId !== focusedRoadId) continue;
      const depth = hierarchyLevel(segment, segmentById);
      for (const memberId of segment.memberNodeIds) {
        nodeLayer.set(memberId, Math.max(nodeLayer.get(memberId) ?? 0, depth));
      }
    }
    const visibleIds = new Set(
      activeNodes.filter((node) => node.permanent || (nodeLayer.get(node.id) ?? 0) <= level).map((node) => node.id),
    );
    if (request.focus?.type === 'node' && nodeById.get(request.focus.id) && !nodeById.get(request.focus.id)?.archivedAt) {
      visibleIds.add(request.focus.id);
    }

    const optionalLabelIds = new Set(
      [...visibleIds]
        .filter((id) => !nodeById.get(id)?.permanent && nodeById.get(id)?.kind !== 'goal')
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
          permanent: node.permanent,
          worldX: placement.worldX,
          worldY,
          depthRank: placement.depthRank,
          showLabel: level >= 2 || node.permanent || node.kind === 'goal' || optionalLabelIds.has(node.id),
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

    // Summary roads bridge hidden chains at every level; at levels where the
    // focused road is fully revealed no components form, so none are produced.
    const summaryConnections = request.snapshot.roads.flatMap((road) => this.summariesForRoad(
      road,
      request,
      visibleIds,
      nodeById,
      placementById,
      projectedNodeById,
      filters,
    ));

    // Layers nest: ancestor levels stay visible as dimmed context frames behind
    // the current level, so zooming reads as descending into the hierarchy.
    const segmentOverlays = request.snapshot.segments
      .map((segment) => ({ segment, depth: hierarchyLevel(segment, segmentById) }))
      .filter(({ segment, depth }) => segment.roadId === focusedRoadId && depth <= level)
      .sort((left, right) => left.depth - right.depth || left.segment.id.localeCompare(right.segment.id))
      .map(({ segment, depth }) => {
        const points = segment.memberNodeIds.flatMap((id) => {
          const placement = placementById.get(id);
          if (!placement) return [];
          return [this.layoutService.worldToScreen(
            { x: placement.worldX, y: this.layoutService.worldY(placement) },
            request.viewport,
            request.camera,
          )];
        });
        // A segment with no placed members (e.g. freshly created and empty)
        // has no frame to draw.
        if (points.length === 0) return [];
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const padding = 20;
        return [{
          id: segment.id,
          roadId: segment.roadId,
          title: segment.title,
          description: segment.description,
          tone: segment.tone,
          hierarchyLevel: depth,
          dimmed: depth < level,
          memberCount: segment.memberNodeIds.length,
          bounds: {
            x: Math.min(...xs) - padding,
            y: Math.min(...ys) - padding,
            width: Math.max(40, Math.max(...xs) - Math.min(...xs) + padding * 2),
            height: Math.max(40, Math.max(...ys) - Math.min(...ys) + padding * 2),
          },
        }];
      })
      .flat();

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
    const descriptors = components.flatMap((component) => {
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
      const covered = rootConnections.filter((connection) =>
        componentIds.has(connection.fromNodeId) || componentIds.has(connection.toNodeId),
      );
      return [{ fromNodeId, toNodeId, from, to, component, covered }];
    });
    // Parallel hidden branches between the same visible endpoints merge into one
    // summary road, matching the prototype (one corridor per boundary pair).
    const groups = new Map<string, typeof descriptors>();
    for (const descriptor of descriptors) {
      const key = `${descriptor.fromNodeId}→${descriptor.toNodeId}`;
      groups.set(key, [...(groups.get(key) ?? []), descriptor]);
    }
    return [...groups.values()].map((group) => {
      const first = group[0];
      const hiddenNodeIds = group.flatMap((descriptor) => descriptor.component).sort();
      const covered = [...new Map(group.flatMap((descriptor) => descriptor.covered).map((connection) => [connection.id, connection])).values()]
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
          id: `summary:${road.id}:${first.fromNodeId}:${first.toNodeId}`,
          fromNodeId: first.fromNodeId,
          toNodeId: first.toNodeId,
          meaning: `summarizes ${road.title}`,
        },
        outcome,
        first.from,
        first.to,
        request,
        sections.every((section) => !filters.has(section.outcome)),
        covered.some((connection) => request.activeRoute?.connectionIds.includes(connection.id)),
      );
      return {
        ...projected,
        kind: 'summary' as const,
        roadId: road.id,
        segmentId: road.rootSegmentId,
        hiddenNodeIds,
        hiddenConnectionIds: covered.map((connection) => connection.id),
        hiddenCount: hiddenNodeIds.length,
        sections,
      };
    });
  }
}
