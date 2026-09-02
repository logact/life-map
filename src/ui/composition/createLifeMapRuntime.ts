import { CaptureRecord } from '../../application/lifeMap/CaptureRecord';
import { EditLifeMap } from '../../application/lifeMap/EditLifeMap';
import { LoadLifeMap, LoadProjectionRequest } from '../../application/lifeMap/LoadLifeMap';
import { FindRoadResult, FindRoadService } from '../../application/map/FindRoadService';
import { PlannedKind, PlannedNode } from '../../domain/lifeMap/entities';
import { MemoryLifeMapRepository } from '../../infrastructure/memory/MemoryLifeMapRepository';
import { MemoryMapLayoutRepository } from '../../infrastructure/memory/MemoryMapLayoutRepository';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../../infrastructure/memory/portraitRoadMapFixture';

export interface RuntimeNodeOption {
  id: string;
  title: string;
  kind: PlannedKind;
  depthRank: number;
  outcome: PlannedNode['outcome'];
}

export class LifeMapRuntime {
  private readonly lifeMaps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
  private readonly layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
  private readonly loadLifeMap = new LoadLifeMap(this.lifeMaps, this.layouts);
  private readonly editLifeMap = new EditLifeMap(this.lifeMaps, this.layouts);
  private readonly captureRecord = new CaptureRecord(this.lifeMaps, this.layouts);
  private readonly findRoadService = new FindRoadService();
  private sequence = 0;

  load(request: LoadProjectionRequest) {
    return this.loadLifeMap.execute(request);
  }

  async options(): Promise<RuntimeNodeOption[]> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    const ranks = new Map(layout.placements.map((placement) => [placement.nodeId, placement.depthRank]));
    return snapshot.nodes
      .filter((node) => !node.archivedAt)
      .map((node) => ({ id: node.id, title: node.title, kind: node.kind, outcome: node.outcome, depthRank: ranks.get(node.id) ?? 0 }))
      .sort((left, right) => left.depthRank - right.depthRank || left.title.localeCompare(right.title));
  }

  async findRoad(fromNodeId: string, toNodeId: string): Promise<FindRoadResult> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    return this.findRoadService.find(snapshot, layout, fromNodeId, toNodeId);
  }

  changeOutcome(nodeId: string, outcome: PlannedNode['outcome']) {
    return this.editLifeMap.changeOutcome(nodeId, outcome);
  }

  editNode(nodeId: string, changes: { title: string; description: string; kind: PlannedKind }) {
    return this.editLifeMap.editNode(nodeId, changes);
  }

  moveNode(nodeId: string, worldX: number, depthRank: number) {
    return this.editLifeMap.moveNode(nodeId, worldX, depthRank);
  }

  moveRecord(recordId: string, worldX: number, worldY: number) {
    return this.editLifeMap.moveRecord(recordId, worldX, worldY);
  }

  bendConnection(connectionId: string, offsetX: number, offsetY: number) {
    return this.editLifeMap.updateConnectionBend(connectionId, offsetX, offsetY);
  }

  connect(fromNodeId: string, toNodeId: string) {
    return this.editLifeMap.connect({
      id: this.id('connection'),
      fromNodeId,
      toNodeId,
      meaning: 'continues toward',
    });
  }

  createNode(input: {
    title: string;
    kind: Exclude<PlannedKind, 'originStatus'>;
    outcome: PlannedNode['outcome'];
    worldX: number;
    depthRank: number;
    fromNodeId?: string;
    segmentId?: string;
  }) {
    const nodeId = this.id('node');
    return this.editLifeMap.createNode({
      node: { id: nodeId, title: input.title, description: '', kind: input.kind, outcome: input.outcome },
      worldX: input.worldX,
      depthRank: input.depthRank,
      segmentId: input.segmentId,
      connection: input.fromNodeId ? {
        id: this.id('connection'),
        fromNodeId: input.fromNodeId,
        toNodeId: nodeId,
        meaning: 'continues toward',
      } : undefined,
    });
  }

  async insertNode(connectionId: string, details?: { title: string; kind: Exclude<PlannedKind, 'originStatus'>; outcome: PlannedNode['outcome'] }): Promise<void> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    const connection = snapshot.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) throw new Error('Connection no longer exists');
    const from = layout.placements.find((placement) => placement.nodeId === connection.fromNodeId)!;
    const to = layout.placements.find((placement) => placement.nodeId === connection.toNodeId)!;
    const nodeId = this.id('node');
    await this.editLifeMap.splitConnection({
      connectionId,
      node: { id: nodeId, title: details?.title ?? 'New step', description: '', kind: details?.kind ?? 'task', outcome: details?.outcome ?? 'todo' },
      incomingConnectionId: this.id('connection'),
      outgoingConnectionId: this.id('connection'),
    }, { worldX: (from.worldX + to.worldX) / 2, depthRank: Math.max(from.depthRank + 1, Math.round((from.depthRank + to.depthRank) / 2)) });
  }

  removeNode(nodeId: string, preserveHistory: boolean) {
    return this.editLifeMap.removeNode(nodeId, preserveHistory ? new Date().toISOString() : undefined);
  }

  removeConnection(connectionId: string) {
    return this.editLifeMap.removeConnection(connectionId);
  }

  resetLayout() {
    return this.editLifeMap.resetLayout();
  }

  addRecord(targetId: string, summary: string) {
    const id = this.id('record');
    return this.captureRecord.execute({
      id,
      targetId,
      summary,
      occurredAt: new Date().toISOString(),
    });
  }

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence.toString(36).padStart(3, '0')}`;
  }
}

export const createLifeMapRuntime = (): LifeMapRuntime => new LifeMapRuntime();
