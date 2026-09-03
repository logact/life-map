import {
  Connection,
  LifeMapSnapshot,
  PlannedNode,
  RecordEntry,
  RoadSegment,
  activeNodes,
  cloneSnapshot,
} from './entities';
import { LifeMapError, invariant } from './LifeMapErrors';
import { MAX_SEGMENT_DEPTH, segmentDepth, segmentSubtreeHeight } from './segmentTree';

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
    const origins = active.filter((node) => node.permanent);
    invariant(origins.length === 1, 'invalid-origin', 'A Life Map requires exactly one active origin', {
      count: origins.length,
    });
    invariant(origins[0].kind === 'status', 'invalid-origin', 'The permanent origin must be a status node', {
      originId: origins[0].id,
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
        // Containment invariant: a layer is carved out of its parent's pool,
        // so "deepest containing segment" is unambiguous for every member.
        for (const nodeId of segment.memberNodeIds) {
          invariant(
            parent.memberNodeIds.includes(nodeId),
            'invalid-segment',
            `Segment ${segment.id} lists node ${nodeId} outside its parent's pool`,
            { segmentId: segment.id, parentSegmentId: parent.id },
          );
        }
        for (const connectionId of segment.connectionIds) {
          invariant(
            parent.connectionIds.includes(connectionId),
            'invalid-segment',
            `Segment ${segment.id} lists connection ${connectionId} outside its parent's pool`,
            { segmentId: segment.id, parentSegmentId: parent.id },
          );
        }
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
      invariant(!node.permanent, 'invalid-operation', 'The permanent origin cannot be created again');
      draft.nodes.push({ ...node });
      if (segmentId) {
        const segment = draft.segments.find((candidate) => candidate.id === segmentId);
        invariant(segment, 'missing-reference', `Segment ${segmentId} does not exist`);
        // Containment: filing into a segment files into every ancestor too.
        let current: RoadSegment | undefined = segment;
        const visited = new Set<string>();
        while (current && !visited.has(current.id)) {
          visited.add(current.id);
          if (!current.memberNodeIds.includes(node.id)) current.memberNodeIds.push(node.id);
          current = current.parentSegmentId
            ? draft.segments.find((candidate) => candidate.id === current!.parentSegmentId)
            : undefined;
        }
      }
    });
  }

  editNode(nodeId: string, changes: Pick<PlannedNode, 'title' | 'description' | 'kind'>): LifeMap {
    return this.evolve((draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === nodeId && !candidate.archivedAt);
      invariant(node, 'missing-reference', `Node ${nodeId} does not exist`);
      invariant(!node.permanent || changes.kind === 'status', 'invalid-operation', 'The permanent origin must remain a status node');
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
      invariant(!input.node.permanent, 'invalid-operation', 'A split node cannot be another origin');
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
      invariant(!node.permanent, 'invalid-operation', 'The permanent origin cannot be removed');
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

  createSegment(segment: RoadSegment): LifeMap {
    return this.evolve((draft) => {
      invariant(
        !segment.roadId || segment.parentSegmentId,
        'invalid-segment',
        'A road segment must have a parent segment',
        { segmentId: segment.id },
      );
      if (segment.parentSegmentId) {
        const parent = draft.segments.find((candidate) => candidate.id === segment.parentSegmentId);
        invariant(parent, 'missing-reference', `Segment ${segment.parentSegmentId} does not exist`, {
          segmentId: segment.parentSegmentId,
        });
        invariant(
          segmentDepth(draft.segments, parent.id) + 1 <= MAX_SEGMENT_DEPTH,
          'invalid-segment',
          'Segment hierarchy is limited to five levels',
          { segmentId: segment.id, parentSegmentId: parent.id },
        );
      }
      draft.segments.push({
        ...segment,
        memberNodeIds: [...segment.memberNodeIds],
        connectionIds: [...segment.connectionIds],
      });
    });
  }

  reparentSegment(segmentId: string, newParentSegmentId: string): LifeMap {
    return this.evolve((draft) => {
      const segment = draft.segments.find((candidate) => candidate.id === segmentId);
      invariant(segment, 'missing-reference', `Segment ${segmentId} does not exist`, { segmentId });
      const parent = draft.segments.find((candidate) => candidate.id === newParentSegmentId);
      invariant(parent, 'missing-reference', `Segment ${newParentSegmentId} does not exist`, { segmentId: newParentSegmentId });
      invariant(segmentId !== newParentSegmentId, 'invalid-operation', 'A segment cannot be nested inside itself', { segmentId });
      invariant(
        !draft.roads.some((road) => road.rootSegmentId === segmentId),
        'invalid-operation',
        'A road root segment cannot be reparented',
        { segmentId },
      );
      invariant(parent.roadId === segment.roadId, 'invalid-segment', 'Child segments must remain inside one road');
      let cursor: RoadSegment | undefined = parent;
      while (cursor) {
        invariant(
          cursor.id !== segmentId,
          'invalid-operation',
          'A segment cannot be nested inside its own subtree',
          { segmentId, parentSegmentId: newParentSegmentId },
        );
        cursor = cursor.parentSegmentId
          ? draft.segments.find((candidate) => candidate.id === cursor!.parentSegmentId)
          : undefined;
      }
      invariant(
        segmentDepth(draft.segments, newParentSegmentId) + 1 + segmentSubtreeHeight(draft.segments, segmentId) <= MAX_SEGMENT_DEPTH,
        'invalid-segment',
        'Segment hierarchy is limited to five levels',
        { segmentId, parentSegmentId: newParentSegmentId },
      );
      segment.parentSegmentId = newParentSegmentId;
    });
  }

  dissolveSegment(segmentId: string): LifeMap {
    return this.evolve((draft) => {
      const segment = draft.segments.find((candidate) => candidate.id === segmentId);
      invariant(segment, 'missing-reference', `Segment ${segmentId} does not exist`, { segmentId });
      invariant(
        !draft.roads.some((road) => road.rootSegmentId === segmentId),
        'invalid-operation',
        'A road root segment cannot be dissolved',
        { segmentId },
      );
      const parent = segment.parentSegmentId
        ? draft.segments.find((candidate) => candidate.id === segment.parentSegmentId)
        : undefined;
      const children = draft.segments.filter((candidate) => candidate.parentSegmentId === segmentId);
      if (parent) {
        // The parent already covers these pools under the containment
        // invariant; merging keeps that true even for legacy snapshots.
        parent.memberNodeIds = [...new Set([...parent.memberNodeIds, ...segment.memberNodeIds])];
        parent.connectionIds = [...new Set([...parent.connectionIds, ...segment.connectionIds])];
        for (const child of children) child.parentSegmentId = parent.id;
      } else {
        // No parent to inherit the pools: members are simply released and
        // children become standalone roots, leaving any road behind.
        const release = (id: string): void => {
          const current = draft.segments.find((candidate) => candidate.id === id);
          if (!current) return;
          current.roadId = undefined;
          for (const child of draft.segments.filter((candidate) => candidate.parentSegmentId === id)) release(child.id);
        };
        for (const child of children) {
          child.parentSegmentId = undefined;
          release(child.id);
        }
      }
      draft.segments = draft.segments.filter((candidate) => candidate.id !== segmentId);
    });
  }

  moveNodeToSegment(nodeId: string, targetSegmentId: string): LifeMap {
    return this.evolve((draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === nodeId && !candidate.archivedAt);
      invariant(node, 'missing-reference', `Node ${nodeId} does not exist`, { nodeId });
      const target = draft.segments.find((candidate) => candidate.id === targetSegmentId);
      invariant(target, 'missing-reference', `Segment ${targetSegmentId} does not exist`, { segmentId: targetSegmentId });
      const memberRoads = new Set(
        draft.segments
          .filter((segment) => segment.roadId && segment.memberNodeIds.includes(nodeId))
          .map((segment) => segment.roadId!),
      );
      invariant(
        !target.roadId || memberRoads.size === 0 || memberRoads.has(target.roadId),
        'invalid-segment',
        'A node cannot move across roads',
        { nodeId, segmentId: targetSegmentId },
      );
      // The move is scoped to the target's tree: the node joins the target and
      // its ancestors (containment) and leaves every other segment of that
      // tree, so its deepest container — its layer — becomes exactly the target.
      const scope = target.roadId
        ? draft.segments.filter((segment) => segment.roadId === target.roadId)
        : [target];
      const kept = new Set<string>();
      let cursor: RoadSegment | undefined = target;
      while (cursor) {
        kept.add(cursor.id);
        cursor = cursor.parentSegmentId
          ? draft.segments.find((candidate) => candidate.id === cursor!.parentSegmentId)
          : undefined;
      }
      const connectionById = new Map(draft.connections.map((connection) => [connection.id, connection]));
      for (const segment of scope) {
        if (kept.has(segment.id)) {
          if (!segment.memberNodeIds.includes(nodeId)) segment.memberNodeIds.push(nodeId);
        } else if (segment.memberNodeIds.includes(nodeId)) {
          segment.memberNodeIds = segment.memberNodeIds.filter((id) => id !== nodeId);
          // A listed connection is only covered while both endpoints stay members.
          segment.connectionIds = segment.connectionIds.filter((id) => {
            const connection = connectionById.get(id);
            return !!connection && segment.memberNodeIds.includes(connection.fromNodeId) && segment.memberNodeIds.includes(connection.toNodeId);
          });
        }
      }
    });
  }
}
