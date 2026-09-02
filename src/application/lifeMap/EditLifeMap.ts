import {
  Connection,
  MapLayoutSnapshot,
  Outcome,
  PlannedKind,
  PlannedNode,
} from '../../domain/lifeMap/entities';
import { LifeMap, SplitConnectionInput } from '../../domain/lifeMap/LifeMap';
import { LifeMapError, invariant } from '../../domain/lifeMap/LifeMapErrors';
import { LifeMapRepository } from '../../domain/lifeMap/repository/LifeMapRepository';
import { MapLayoutRepository } from '../../domain/lifeMap/repository/MapLayoutRepository';
import { RoadLayoutService } from '../map/RoadLayoutService';

export interface CreateNodeCommand {
  node: PlannedNode;
  worldX: number;
  depthRank: number;
  connection?: Connection;
  segmentId?: string;
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
    invariant(node.kind !== 'originStatus' || depthRank === 0, 'invalid-operation', 'The origin depth is fixed');
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
