export type PlannedKind = 'status' | 'goal' | 'task';
export type Outcome = 'success' | 'todo' | 'failed';

export interface PlannedNode {
  id: string;
  kind: PlannedKind;
  title: string;
  description: string;
  outcome: Outcome;
  /** Marks the single permanent origin status node ("Start"). */
  permanent?: boolean;
  archivedAt?: string;
}

export interface Connection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  meaning: string;
}

export interface Road {
  id: string;
  title: string;
  description: string;
  destinationGoalId: string;
  rootSegmentId: string;
  featured?: boolean;
}

export interface RoadSegment {
  id: string;
  roadId?: string;
  parentSegmentId?: string;
  title: string;
  description: string;
  memberNodeIds: string[];
  connectionIds: string[];
  tone?: 'foundation' | 'distance' | 'readiness';
}

export interface RecordEntry {
  id: string;
  targetId: string;
  occurredAt: string;
  summary: string;
  content?: string;
}

export interface LifeMapSnapshot {
  version: number;
  nodes: PlannedNode[];
  connections: Connection[];
  roads: Road[];
  segments: RoadSegment[];
  records: RecordEntry[];
}

export interface MapPlacement {
  nodeId: string;
  worldX: number;
  depthRank: number;
  inlineWorldY?: number;
}

export interface RecordPlacement {
  recordId: string;
  worldX: number;
  worldY: number;
}

export interface ConnectionBend {
  connectionId: string;
  offsetX: number;
  offsetY: number;
}

export interface MapLayoutSnapshot {
  version: number;
  placements: MapPlacement[];
  recordPlacements: RecordPlacement[];
  bends: ConnectionBend[];
}

export const activeNodes = (snapshot: LifeMapSnapshot): PlannedNode[] =>
  snapshot.nodes.filter((node) => !node.archivedAt);

export const cloneSnapshot = (snapshot: LifeMapSnapshot): LifeMapSnapshot => ({
  ...snapshot,
  nodes: snapshot.nodes.map((node) => ({ ...node })),
  connections: snapshot.connections.map((connection) => ({ ...connection })),
  roads: snapshot.roads.map((road) => ({ ...road })),
  segments: snapshot.segments.map((segment) => ({
    ...segment,
    memberNodeIds: [...segment.memberNodeIds],
    connectionIds: [...segment.connectionIds],
  })),
  records: snapshot.records.map((record) => ({ ...record })),
});

export const cloneLayout = (layout: MapLayoutSnapshot): MapLayoutSnapshot => ({
  ...layout,
  placements: layout.placements.map((placement) => ({ ...placement })),
  recordPlacements: layout.recordPlacements.map((placement) => ({ ...placement })),
  bends: layout.bends.map((bend) => ({ ...bend })),
});
