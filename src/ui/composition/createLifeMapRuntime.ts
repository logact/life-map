import { CaptureRecord } from '../../application/lifeMap/CaptureRecord';
import { EditLifeMap } from '../../application/lifeMap/EditLifeMap';
import { LoadLifeMap, LoadProjectionRequest } from '../../application/lifeMap/LoadLifeMap';
import { FindRoadResult, FindRoadService, RoadPreview, RoadSearchResult } from '../../application/map/FindRoadService';
import { LifeMapSnapshot, MapLayoutSnapshot, PlannedKind, PlannedNode } from '../../domain/lifeMap/entities';
import { segmentDepth } from '../../domain/lifeMap/segmentTree';
import { MemoryLifeMapRepository } from '../../infrastructure/memory/MemoryLifeMapRepository';
import { MemoryMapLayoutRepository } from '../../infrastructure/memory/MemoryMapLayoutRepository';
import { createPortraitLifeMapLayout, createPortraitLifeMapSnapshot } from '../../infrastructure/memory/portraitLifeMapSeed';

export interface RuntimeNodeOption {
  id: string;
  title: string;
  kind: PlannedKind;
  depthRank: number;
  outcome: PlannedNode['outcome'];
}

/** A segment of the focused road, with its depth (= the layer it curates). */
export interface RuntimeSegmentOption {
  id: string;
  title: string;
  depth: number;
}

export class LifeMapRuntime {
  private readonly lifeMaps: MemoryLifeMapRepository;
  private readonly layouts: MemoryMapLayoutRepository;
  private readonly loadLifeMap: LoadLifeMap;
  private readonly editLifeMap: EditLifeMap;
  private readonly captureRecord: CaptureRecord;
  private readonly findRoadService = new FindRoadService();
  private sequence = 0;

  constructor(
    snapshot: LifeMapSnapshot = createPortraitLifeMapSnapshot(),
    layout: MapLayoutSnapshot = createPortraitLifeMapLayout(),
  ) {
    this.lifeMaps = new MemoryLifeMapRepository(snapshot);
    this.layouts = new MemoryMapLayoutRepository(layout);
    this.loadLifeMap = new LoadLifeMap(this.lifeMaps, this.layouts);
    this.editLifeMap = new EditLifeMap(this.lifeMaps, this.layouts);
    this.captureRecord = new CaptureRecord(this.lifeMaps, this.layouts);
  }

  load(request: LoadProjectionRequest) {
    return this.loadLifeMap.execute(request);
  }

  /** Camera/focus/filter changes re-project from cached data — no repository round trip. */
  reproject(request: LoadProjectionRequest) {
    return this.loadLifeMap.reproject(request);
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

  /** Every path from → to, ranked best-first — the alternatives the user can choose among. */
  async findRoads(fromNodeId: string, toNodeId: string): Promise<RoadSearchResult[]> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    return this.findRoadService.findAll(snapshot, layout, fromNodeId, toNodeId);
  }

  async routePreviews(fromNodeId: string): Promise<RoadPreview[]> {
    const snapshot = await this.lifeMaps.load();
    return this.findRoadService.previewAll(snapshot, fromNodeId);
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
    kind: PlannedKind;
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

  async insertNode(connectionId: string, details?: { title: string; kind: PlannedKind; outcome: PlannedNode['outcome'] }): Promise<void> {
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

  /** The focused (featured) road's segments, shallowest first — the layers a node can be filed into. */
  async segmentOptions(): Promise<RuntimeSegmentOption[]> {
    const snapshot = await this.lifeMaps.load();
    const focusedRoadId = snapshot.roads.find((road) => road.featured)?.id ?? snapshot.roads[0]?.id;
    return snapshot.segments
      .filter((segment) => segment.roadId === focusedRoadId)
      .map((segment) => ({ id: segment.id, title: segment.title, depth: segmentDepth(snapshot.segments, segment.id) }))
      .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
  }

  moveNodeToSegment(nodeId: string, targetSegmentId: string) {
    return this.editLifeMap.moveNodeToSegment(nodeId, targetSegmentId);
  }

  async createSubSegmentForConnection(connectionId: string): Promise<string> {
    const snapshot = await this.lifeMaps.load();
    const connection = snapshot.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) throw new Error('Connection no longer exists');
    const titleOf = (nodeId: string) => snapshot.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;
    const id = this.id('segment');
    await this.editLifeMap.createSubSegmentForConnection({
      id,
      connectionId,
      title: `${titleOf(connection.fromNodeId)} → ${titleOf(connection.toNodeId)}`,
    });
    return id;
  }

  /**
   * Extracts a connection into its own deeper segment and returns that
   * segment's id. A connection already filed as a segment's sole connection
   * reuses that segment instead of nesting a redundant one.
   */
  async extractConnection(connectionId: string): Promise<string> {
    const snapshot = await this.lifeMaps.load();
    const connection = snapshot.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) throw new Error('Connection no longer exists');
    const existing = snapshot.segments.find((segment) =>
      segment.connectionIds.length === 1 && segment.connectionIds[0] === connection.id
      && segment.memberNodeIds.includes(connection.fromNodeId) && segment.memberNodeIds.includes(connection.toNodeId));
    if (existing) return existing.id;
    return this.createSubSegmentForConnection(connectionId);
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

export const createLifeMapRuntime = (snapshot?: LifeMapSnapshot, layout?: MapLayoutSnapshot): LifeMapRuntime =>
  new LifeMapRuntime(snapshot, layout);
