import {
  Connection,
  LifeMapSnapshot,
  PlannedNode,
  RecordEntry,
  activeNodes,
  cloneSnapshot,
} from './entities';
import { LifeMapError, invariant } from './LifeMapErrors';

export interface NewPlannedNode extends PlannedNode {}

export interface SplitConnectionInput {
  connectionId: string;
  node: NewPlannedNode;
  incomingConnectionId: string;
  outgoingConnectionId: string;
  incomingMeaning?: string;
  outgoingMeaning?: string;
}

const uniqueIds = (items: Array<{ id: string }>, label: string): void => {
  const ids = new Set<string>();
  for (const item of items) {
    invariant(!ids.has(item.id), 'duplicate-id', `Duplicate ${label} id: ${item.id}`, { id: item.id });
    ids.add(item.id);
  }
};

const assertAcyclic = (snapshot: LifeMapSnapshot): void => {
  const active = new Set(activeNodes(snapshot).map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  for (const connection of snapshot.connections) {
    if (active.has(connection.fromNodeId) && active.has(connection.toNodeId)) {
      const targets = outgoing.get(connection.fromNodeId) ?? [];
      targets.push(connection.toNodeId);
      outgoing.set(connection.fromNodeId, targets);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new LifeMapError('cycle', `Connection topology contains a cycle at ${id}`, { nodeId: id });
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of outgoing.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of active) visit(id);
};

const assertSegmentTree = (snapshot: LifeMapSnapshot): void => {
  const segments = new Map(snapshot.segments.map((segment) => [segment.id, segment]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new LifeMapError('invalid-segment', `Segment containment contains a cycle at ${id}`, { segmentId: id });
    }
    if (visited.has(id)) return;
    const segment = segments.get(id);
    invariant(segment, 'missing-reference', `Missing segment ${id}`, { segmentId: id });
    visiting.add(id);
    if (segment.parentSegmentId) visit(segment.parentSegmentId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const segment of snapshot.segments) visit(segment.id);
};

export class LifeMap {
  private constructor(private readonly state: LifeMapSnapshot) {}

  static create(snapshot: LifeMapSnapshot): LifeMap {
    LifeMap.validate(snapshot);
    return new LifeMap(cloneSnapshot(snapshot));
  }

  static validate(snapshot: LifeMapSnapshot): void {
    uniqueIds(snapshot.nodes, 'node');
    uniqueIds(snapshot.connections, 'connection');
    uniqueIds(snapshot.roads, 'road');
    uniqueIds(snapshot.segments, 'segment');
    uniqueIds(snapshot.records, 'record');

    const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const active = activeNodes(snapshot);
    const origins = active.filter((node) => node.kind === 'originStatus');
    invariant(origins.length === 1, 'invalid-origin', 'A Life Map requires exactly one active origin', {
      count: origins.length,
    });
    invariant(
      !snapshot.connections.some((connection) => connection.toNodeId === origins[0].id),
      'invalid-origin',
      'The origin cannot have an incoming connection',
      { originId: origins[0].id },
    );

    for (const connection of snapshot.connections) {
      const from = nodes.get(connection.fromNodeId);
      const to = nodes.get(connection.toNodeId);
      invariant(from && !from.archivedAt, 'missing-reference', `Connection ${connection.id} has no active source`, {
        connectionId: connection.id,
      });
      invariant(to && !to.archivedAt, 'missing-reference', `Connection ${connection.id} has no active target`, {
        connectionId: connection.id,
      });
      invariant(connection.fromNodeId !== connection.toNodeId, 'cycle', 'A node cannot connect to itself');
    }
    assertAcyclic(snapshot);

    const connections = new Set(snapshot.connections.map((connection) => connection.id));
    const segments = new Map(snapshot.segments.map((segment) => [segment.id, segment]));
    for (const segment of snapshot.segments) {
      if (segment.parentSegmentId) {
        const parent = segments.get(segment.parentSegmentId);
        invariant(parent, 'missing-reference', `Segment ${segment.id} has a missing parent`, { segmentId: segment.id });
        invariant(parent.roadId === segment.roadId, 'invalid-segment', 'Child segments must remain inside one road');
      }
      for (const nodeId of segment.memberNodeIds) {
        invariant(nodes.has(nodeId), 'missing-reference', `Segment ${segment.id} references missing node ${nodeId}`);
      }
      for (const connectionId of segment.connectionIds) {
        invariant(connections.has(connectionId), 'missing-reference', `Segment ${segment.id} references missing connection ${connectionId}`);
      }
    }
    assertSegmentTree(snapshot);

    for (const road of snapshot.roads) {
      const destination = nodes.get(road.destinationGoalId);
      invariant(destination?.kind === 'goal' && !destination.archivedAt, 'invalid-road', `Road ${road.id} needs an active Goal destination`);
      const root = segments.get(road.rootSegmentId);
      invariant(root?.roadId === road.id && !root.parentSegmentId, 'invalid-road', `Road ${road.id} needs one root segment`);
    }
    for (const segment of snapshot.segments.filter((candidate) => candidate.roadId)) {
      invariant(snapshot.roads.some((road) => road.id === segment.roadId), 'invalid-segment', `Segment ${segment.id} references a missing road`);
    }

    for (const record of snapshot.records) {
      const target = nodes.get(record.targetId);
      invariant(
        target?.kind === 'goal' || target?.kind === 'task',
        'invalid-record-target',
        `Record ${record.id} must target an existing Goal or Task`,
        { recordId: record.id, targetId: record.targetId },
      );
    }
  }

  snapshot(): LifeMapSnapshot {
    return cloneSnapshot(this.state);
  }

  private evolve(change: (draft: LifeMapSnapshot) => void): LifeMap {
    const next = cloneSnapshot(this.state);
    change(next);
    next.version += 1;
    return LifeMap.create(next);
  }

  createNode(node: NewPlannedNode, segmentId?: string): LifeMap {
    return this.evolve((draft) => {
      invariant(node.kind !== 'originStatus', 'invalid-operation', 'The permanent origin cannot be created again');
      draft.nodes.push({ ...node });
      if (segmentId) {
        const segment = draft.segments.find((candidate) => candidate.id === segmentId);
        invariant(segment, 'missing-reference', `Segment ${segmentId} does not exist`);
        segment.memberNodeIds.push(node.id);
      }
    });
  }

  editNode(nodeId: string, changes: Pick<PlannedNode, 'title' | 'description' | 'kind'>): LifeMap {
    return this.evolve((draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === nodeId && !candidate.archivedAt);
      invariant(node, 'missing-reference', `Node ${nodeId} does not exist`);
      invariant(node.kind !== 'originStatus' || changes.kind === 'originStatus', 'invalid-operation', 'The origin kind is permanent');
      invariant(changes.kind !== 'originStatus' || node.kind === 'originStatus', 'invalid-operation', 'No other node can become the origin');
      node.title = changes.title.trim();
      node.description = changes.description.trim();
      node.kind = changes.kind;
    });
  }

  connect(connection: Connection): LifeMap {
    return this.evolve((draft) => draft.connections.push({ ...connection }));
  }

  changeOutcome(nodeId: string, outcome: PlannedNode['outcome']): LifeMap {
    return this.evolve((draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === nodeId && !candidate.archivedAt);
      invariant(node, 'missing-reference', `Node ${nodeId} does not exist`);
      node.outcome = outcome;
    });
  }

  splitConnection(input: SplitConnectionInput): LifeMap {
    return this.evolve((draft) => {
      const index = draft.connections.findIndex((connection) => connection.id === input.connectionId);
      invariant(index >= 0, 'missing-reference', `Connection ${input.connectionId} does not exist`);
      invariant(input.node.kind !== 'originStatus', 'invalid-operation', 'A split node cannot be another origin');
      const replaced = draft.connections[index];
      const incoming: Connection = {
        id: input.incomingConnectionId,
        fromNodeId: replaced.fromNodeId,
        toNodeId: input.node.id,
        meaning: input.incomingMeaning ?? replaced.meaning,
      };
      const outgoing: Connection = {
        id: input.outgoingConnectionId,
        fromNodeId: input.node.id,
        toNodeId: replaced.toNodeId,
        meaning: input.outgoingMeaning ?? replaced.meaning,
      };
      draft.nodes.push({ ...input.node });
      draft.connections.splice(index, 1, incoming, outgoing);
      for (const segment of draft.segments) {
        const membershipIndex = segment.connectionIds.indexOf(replaced.id);
        if (membershipIndex >= 0) {
          segment.connectionIds.splice(membershipIndex, 1, incoming.id, outgoing.id);
          if (!segment.memberNodeIds.includes(input.node.id)) segment.memberNodeIds.push(input.node.id);
        }
      }
    });
  }

  removeConnection(connectionId: string): LifeMap {
    return this.evolve((draft) => {
      invariant(draft.connections.some((connection) => connection.id === connectionId), 'missing-reference', `Connection ${connectionId} does not exist`);
      draft.connections = draft.connections.filter((connection) => connection.id !== connectionId);
      for (const segment of draft.segments) {
        segment.connectionIds = segment.connectionIds.filter((id) => id !== connectionId);
      }
    });
  }

  removeNode(nodeId: string, archivedAt?: string): LifeMap {
    return this.evolve((draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === nodeId && !candidate.archivedAt);
      invariant(node, 'missing-reference', `Node ${nodeId} does not exist`);
      invariant(node.kind !== 'originStatus', 'invalid-operation', 'The permanent origin cannot be removed');
      invariant(!draft.roads.some((road) => road.destinationGoalId === nodeId), 'invalid-operation', 'A Road destination cannot be removed');
      const isReferenced = draft.records.some((record) => record.targetId === nodeId);
      if (isReferenced) {
        invariant(archivedAt, 'history-protected', 'This node has Records and must be archived to preserve history', { nodeId });
        node.archivedAt = archivedAt;
      } else {
        draft.nodes = draft.nodes.filter((candidate) => candidate.id !== nodeId);
      }
      const removedConnections = new Set(
        draft.connections
          .filter((connection) => connection.fromNodeId === nodeId || connection.toNodeId === nodeId)
          .map((connection) => connection.id),
      );
      draft.connections = draft.connections.filter((connection) => !removedConnections.has(connection.id));
      for (const segment of draft.segments) {
        segment.memberNodeIds = segment.memberNodeIds.filter((id) => id !== nodeId);
        segment.connectionIds = segment.connectionIds.filter((id) => !removedConnections.has(id));
      }
    });
  }

  captureRecord(record: RecordEntry): LifeMap {
    return this.evolve((draft) => draft.records.push({ ...record }));
  }
}
