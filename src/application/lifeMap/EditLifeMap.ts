import {
  Connection,
  MapLayoutSnapshot,
  Outcome,
  PlannedKind,
  PlannedNode,
  RoadSegment,
} from '../../domain/lifeMap/entities';
import { LifeMap, SplitConnectionInput } from '../../domain/lifeMap/LifeMap';
import { LifeMapError, invariant } from '../../domain/lifeMap/LifeMapErrors';
import { LifeMapRepository } from '../../domain/lifeMap/repository/LifeMapRepository';
import { MapLayoutRepository } from '../../domain/lifeMap/repository/MapLayoutRepository';
import { MAX_SEGMENT_DEPTH, deepestSegmentContaining, segmentDepth } from '../../domain/lifeMap/segmentTree';
import { RoadLayoutService } from '../map/RoadLayoutService';

export interface CreateNodeCommand {
  node: PlannedNode;
  worldX: number;
  depthRank: number;
  connection?: Connection;
  segmentId?: string;
}

export interface GroupIntoSubSegmentCommand {
  id: string;
  title: string;
  parentSegmentId: string;
  memberNodeIds: string[];
  childSegmentIds: string[];
  tone?: RoadSegment['tone'];
}

export interface CreateSubSegmentForConnectionCommand {
  id: string;
  connectionId: string;
  title: string;
}

export class EditLifeMap {
  private readonly layoutService = new RoadLayoutService();

  constructor(
    private readonly lifeMaps: LifeMapRepository,
    private readonly layouts: MapLayoutRepository,
  ) {}

  async createNode(command: CreateNodeCommand): Promise<void> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    let aggregate = LifeMap.create(snapshot).createNode(command.node, command.segmentId);
    if (command.connection) aggregate = aggregate.connect(command.connection);
    const nextLayout = this.layoutService.withMovedNode(layout, command.node.id, command.worldX, command.depthRank);
    await this.layouts.save(nextLayout, layout.version);
    try {
      await this.lifeMaps.save(aggregate.snapshot(), snapshot.version);
    } catch (error) {
      await this.tryRestoreLayout(layout, nextLayout.version);
      throw error;
    }
  }

  async editNode(nodeId: string, changes: { title: string; description: string; kind: PlannedKind }): Promise<void> {
    await this.mutate((lifeMap) => lifeMap.editNode(nodeId, changes));
  }

  async connect(connection: Connection): Promise<void> {
    await this.mutate((lifeMap) => lifeMap.connect(connection));
  }

  async changeOutcome(nodeId: string, outcome: Outcome): Promise<void> {
    await this.mutate((lifeMap) => lifeMap.changeOutcome(nodeId, outcome));
  }

  async splitConnection(input: SplitConnectionInput, placement: { worldX: number; depthRank: number }): Promise<void> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    const next = LifeMap.create(snapshot).splitConnection(input).snapshot();
    const nextLayout = this.layoutService.withMovedNode(layout, input.node.id, placement.worldX, placement.depthRank);
    await this.layouts.save(nextLayout, layout.version);
    try {
      await this.lifeMaps.save(next, snapshot.version);
    } catch (error) {
      await this.tryRestoreLayout(layout, nextLayout.version);
      throw error;
    }
  }

  async removeConnection(connectionId: string): Promise<void> {
    await this.mutate((lifeMap) => lifeMap.removeConnection(connectionId));
  }

  async removeNode(nodeId: string, archivedAt?: string): Promise<void> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    const next = LifeMap.create(snapshot).removeNode(nodeId, archivedAt).snapshot();
    await this.lifeMaps.save(next, snapshot.version);
    const nextLayout: MapLayoutSnapshot = {
      ...layout,
      version: layout.version + 1,
      placements: layout.placements.filter((placement) => placement.nodeId !== nodeId),
      recordPlacements: layout.recordPlacements.map((placement) => ({ ...placement })),
      bends: layout.bends.filter((bend) => next.connections.some((connection) => connection.id === bend.connectionId)),
    };
    try {
      await this.layouts.save(nextLayout, layout.version);
    } catch (error) {
      throw new LifeMapError('version-conflict', 'The node changed, but its placement could not be removed safely', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async moveNode(nodeId: string, worldX: number, depthRank: number): Promise<void> {
    const snapshot = await this.lifeMaps.load();
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId && !candidate.archivedAt);
    invariant(node, 'missing-reference', `Node ${nodeId} does not exist`);
    invariant(!node.permanent || depthRank === 0, 'invalid-operation', 'The origin depth is fixed');
    const layout = await this.layouts.load();
    const next = this.layoutService.withMovedNode(layout, nodeId, worldX, depthRank);
    await this.layouts.save(next, layout.version);
  }

  async moveRecord(recordId: string, worldX: number, worldY: number): Promise<void> {
    const snapshot = await this.lifeMaps.load();
    invariant(snapshot.records.some((record) => record.id === recordId), 'missing-reference', `Record ${recordId} does not exist`);
    const layout = await this.layouts.load();
    await this.layouts.save(this.layoutService.withMovedRecord(layout, recordId, worldX, worldY), layout.version);
  }

  async updateConnectionBend(connectionId: string, offsetX: number, offsetY: number): Promise<void> {
    const snapshot = await this.lifeMaps.load();
    invariant(snapshot.connections.some((connection) => connection.id === connectionId), 'missing-reference', `Connection ${connectionId} does not exist`);
    const layout = await this.layouts.load();
    await this.layouts.save(this.layoutService.withConnectionBend(layout, connectionId, offsetX, offsetY), layout.version);
  }

  async resetLayout(): Promise<void> {
    await this.layouts.reset();
  }

  /**
   * Groups chosen nodes and child segments into a new sub-segment of `parent`.
   * Membership is recomputed here: nodes must already belong to the parent,
   * connections come from the parent's pool, and only direct children of the
   * parent are reparented into the new segment.
   */
  async groupIntoSubSegment(command: GroupIntoSubSegmentCommand): Promise<void> {
    const snapshot = await this.lifeMaps.load();
    const parent = snapshot.segments.find((segment) => segment.id === command.parentSegmentId);
    invariant(parent, 'missing-reference', `Segment ${command.parentSegmentId} does not exist`, { segmentId: command.parentSegmentId });
    const childSegments = snapshot.segments.filter(
      (segment) => command.childSegmentIds.includes(segment.id) && segment.parentSegmentId === parent.id,
    );
    const memberNodeIds = [...new Set([
      ...command.memberNodeIds.filter((id) => parent.memberNodeIds.includes(id)),
      ...childSegments.flatMap((segment) => segment.memberNodeIds),
    ])];
    const memberSet = new Set(memberNodeIds);
    const connectionIds = [...new Set([
      ...parent.connectionIds.filter((connectionId) => {
        const connection = snapshot.connections.find((candidate) => candidate.id === connectionId);
        return !!connection && memberSet.has(connection.fromNodeId) && memberSet.has(connection.toNodeId);
      }),
      ...childSegments.flatMap((segment) => segment.connectionIds),
    ])];
    const next = childSegments.reduce(
      (map, child) => map.reparentSegment(child.id, command.id),
      LifeMap.create(snapshot).createSegment({
        id: command.id,
        roadId: parent.roadId,
        parentSegmentId: parent.id,
        title: command.title.trim(),
        description: '',
        memberNodeIds,
        connectionIds,
        tone: command.tone,
      }),
    ).snapshot();
    await this.lifeMaps.save(next, snapshot.version);
  }

  async reparentSegment(segmentId: string, newParentSegmentId: string): Promise<void> {
    await this.mutate((lifeMap) => lifeMap.reparentSegment(segmentId, newParentSegmentId));
  }

  async dissolveSegment(segmentId: string): Promise<void> {
    await this.mutate((lifeMap) => lifeMap.dissolveSegment(segmentId));
  }

  async moveNodeToSegment(nodeId: string, targetSegmentId: string): Promise<void> {
    await this.mutate((lifeMap) => lifeMap.moveNodeToSegment(nodeId, targetSegmentId));
  }

  /**
   * Creates a segment covering a single connection. The parent is the deepest
   * segment containing the connection and both endpoints that still has room
   * for a child within the five-level hierarchy; connections no segment
   * contains produce a standalone segment, like the fixture's cross-road
   * bridges.
   */
  async createSubSegmentForConnection(command: CreateSubSegmentForConnectionCommand): Promise<void> {
    const snapshot = await this.lifeMaps.load();
    const connection = snapshot.connections.find((candidate) => candidate.id === command.connectionId);
    invariant(connection, 'missing-reference', `Connection ${command.connectionId} does not exist`, { connectionId: command.connectionId });
    const parent = deepestSegmentContaining(
      snapshot.segments,
      (segment) => segment.connectionIds.includes(connection.id)
        && segment.memberNodeIds.includes(connection.fromNodeId)
        && segment.memberNodeIds.includes(connection.toNodeId)
        && segmentDepth(snapshot.segments, segment.id) < MAX_SEGMENT_DEPTH,
    );
    const next = LifeMap.create(snapshot).createSegment({
      id: command.id,
      roadId: parent?.roadId,
      parentSegmentId: parent?.id,
      title: command.title.trim(),
      description: '',
      memberNodeIds: [connection.fromNodeId, connection.toNodeId],
      connectionIds: [connection.id],
    }).snapshot();
    await this.lifeMaps.save(next, snapshot.version);
  }

  private async mutate(operation: (lifeMap: LifeMap) => LifeMap): Promise<void> {
    const snapshot = await this.lifeMaps.load();
    const next = operation(LifeMap.create(snapshot)).snapshot();
    await this.lifeMaps.save(next, snapshot.version);
  }

  private async tryRestoreLayout(layout: MapLayoutSnapshot, expectedVersion: number): Promise<void> {
    try {
      await this.layouts.save({ ...layout, version: expectedVersion + 1 }, expectedVersion);
    } catch {
      // A concurrent layout update is more important than the best-effort rollback.
    }
  }
}
