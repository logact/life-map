import { LifeMap } from '../../src/domain/lifeMap/LifeMap';
import { LifeMapError } from '../../src/domain/lifeMap/LifeMapErrors';
import { createPortraitRoadMapSnapshot } from '../fixtures/portraitRoadMapFixture';

describe('LifeMap aggregate', () => {
  it('accepts the portrait fixture with one permanent origin and a five-deep segment tree', () => {
    const snapshot = LifeMap.create(createPortraitRoadMapSnapshot()).snapshot();
    expect(snapshot.nodes.filter((node) => node.permanent && !node.archivedAt)).toHaveLength(1);

    const byId = new Map(snapshot.segments.map((segment) => [segment.id, segment]));
    const atomic = byId.get('marathon-weekly-base-atomic-r5');
    expect(atomic?.parentSegmentId).toBe('marathon-weekly-base-node-group');
    expect(byId.get(atomic!.parentSegmentId!)?.parentSegmentId).toBe('marathon-weekly-base');
  });

  it('rejects a connection that would create a cycle', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.connect({
      id: 'cycle-edge',
      fromNodeId: 'ten-k-checkpoint',
      toNodeId: 'base-mileage',
      meaning: 'points backward in topology',
    })).toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'cycle' }));
  });

  it('rejects creating a second permanent origin node', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.createNode({
      id: 'second-origin',
      kind: 'status',
      permanent: true,
      title: 'Another start',
      description: 'Not allowed.',
      outcome: 'todo',
    })).toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-operation' }));
  });

  it('keeps the permanent origin a status node while other nodes can become status', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.editNode('start', { title: 'Started here', description: '', kind: 'goal' }))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-operation' }));
    const after = map.editNode('choose', { title: 'Choose a focus', description: '', kind: 'status' }).snapshot();
    expect(after.nodes.find((node) => node.id === 'choose')?.kind).toBe('status');
    expect(after.nodes.find((node) => node.id === 'start')?.permanent).toBe(true);
  });

  it('splits an edge transactionally and preserves every segment membership', () => {
    const before = createPortraitRoadMapSnapshot();
    const containing = before.segments.filter((segment) => segment.connectionIds.includes('r5')).map((segment) => segment.id);
    const after = LifeMap.create(before).splitConnection({
      connectionId: 'r5',
      node: { id: 'easy-week', kind: 'task', title: 'Easy week', description: 'Deload safely.', outcome: 'todo' },
      incomingConnectionId: 'r5a',
      outgoingConnectionId: 'r5b',
    }).snapshot();

    expect(after.connections.some((connection) => connection.id === 'r5')).toBe(false);
    for (const segmentId of containing) {
      const segment = after.segments.find((candidate) => candidate.id === segmentId)!;
      expect(segment.connectionIds).toEqual(expect.arrayContaining(['r5a', 'r5b']));
      expect(segment.memberNodeIds).toContain('easy-week');
    }
  });

  it('protects Record history by requiring archival of referenced targets', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.removeNode('run')).toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'history-protected' }));
    const archived = map.removeNode('run', '2026-09-02T08:00:00.000Z').snapshot();
    expect(archived.nodes.find((node) => node.id === 'run')?.archivedAt).toBeTruthy();
    expect(archived.records.find((record) => record.id === 'record-run')?.targetId).toBe('run');
    expect(archived.connections.some((connection) => connection.fromNodeId === 'run' || connection.toNodeId === 'run')).toBe(false);
  });

  it('only permits Records on an exact Goal or Task', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.captureRecord({
      id: 'bad-record',
      targetId: 'ten-k-checkpoint',
      occurredAt: '2026-09-02T08:00:00.000Z',
      summary: 'Checkpoint note',
    })).toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-record-target' }));
  });

  it('adds a created node to a segment when a segment is given', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    const after = map.createNode(
      { id: 'stride', kind: 'task', title: 'Stride session', description: '', outcome: 'todo' },
      'marathon-weekly-base',
    ).snapshot();
    expect(after.segments.find((segment) => segment.id === 'marathon-weekly-base')?.memberNodeIds).toContain('stride');
  });

  it('creates a sub-segment under an existing segment', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    const after = map.createSegment({
      id: 'recovery-focus',
      roadId: 'marathon-road',
      parentSegmentId: 'marathon-weekly-base',
      title: 'Recovery focus',
      description: 'Sleep-first view of the weekly base.',
      memberNodeIds: ['base-mileage', 'run', 'sleep'],
      connectionIds: ['r5', 'r21'],
      tone: 'foundation',
    }).snapshot();
    const created = after.segments.find((segment) => segment.id === 'recovery-focus');
    expect(created).toEqual(expect.objectContaining({
      roadId: 'marathon-road',
      parentSegmentId: 'marathon-weekly-base',
      memberNodeIds: ['base-mileage', 'run', 'sleep'],
      connectionIds: ['r5', 'r21'],
    }));
  });

  it('rejects a child segment whose pools escape its parent', () => {
    const snapshot = createPortraitRoadMapSnapshot();
    const parent = snapshot.segments.find((segment) => segment.id === 'marathon-weekly-base')!;
    snapshot.segments.push({
      id: 'escapee',
      roadId: 'marathon-road',
      parentSegmentId: parent.id,
      title: 'Escapee',
      description: '',
      memberNodeIds: [...parent.memberNodeIds, 'choose'],
      connectionIds: parent.connectionIds,
    });
    expect(() => LifeMap.create(snapshot))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-segment' }));
    const connectionEscape = createPortraitRoadMapSnapshot();
    connectionEscape.segments.push({
      id: 'escapee',
      roadId: 'marathon-road',
      parentSegmentId: parent.id,
      title: 'Escapee',
      description: '',
      memberNodeIds: parent.memberNodeIds,
      connectionIds: [...parent.connectionIds, 'r9'],
    });
    expect(() => LifeMap.create(connectionEscape))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-segment' }));
  });

  it('rejects a road segment without a parent and a missing parent', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.createSegment({
      id: 'orphan',
      roadId: 'marathon-road',
      title: 'Orphan',
      description: '',
      memberNodeIds: [],
      connectionIds: [],
    })).toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-segment' }));
    expect(() => map.createSegment({
      id: 'lost',
      parentSegmentId: 'missing-parent',
      title: 'Lost',
      description: '',
      memberNodeIds: [],
      connectionIds: [],
    })).toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'missing-reference' }));
  });

  it('rejects a sub-segment deeper than the five-level hierarchy', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.createSegment({
      id: 'too-deep',
      roadId: 'marathon-road',
      parentSegmentId: 'marathon-weekly-base-atomic-r5',
      title: 'Too deep',
      description: '',
      memberNodeIds: ['run'],
      connectionIds: [],
    })).toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-segment' }));
  });

  it('reparents a segment under another segment of the same road', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    // The root's pool covers every member, so the containment invariant holds.
    const after = map.reparentSegment('marathon-10k-gate', 'marathon-journey').snapshot();
    expect(after.segments.find((segment) => segment.id === 'marathon-10k-gate')?.parentSegmentId).toBe('marathon-journey');
    expect(after.segments.find((segment) => segment.id === 'marathon-10k-gate-node-group')?.parentSegmentId).toBe('marathon-10k-gate');
  });

  it('rejects reparenting a road root, a subtree cycle, and a cross-road move', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.reparentSegment('marathon-journey', 'family-journey'))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-operation' }));
    expect(() => map.reparentSegment('marathon-foundation', 'marathon-weekly-base-node-group'))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-operation' }));
    expect(() => map.reparentSegment('marathon-direction', 'family-direction'))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-segment' }));
  });

  it('rejects a reparent that would push the subtree past five levels', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.reparentSegment('marathon-10k-gate', 'marathon-weekly-base-node-group'))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-segment' }));
  });

  it('rejects dissolving a road root segment', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.dissolveSegment('marathon-journey'))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-operation' }));
  });

  it('dissolves a segment, promotes its children, and merges pools into the parent', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    const after = map.dissolveSegment('marathon-foundation').snapshot();
    expect(after.segments.some((segment) => segment.id === 'marathon-foundation')).toBe(false);
    const promoted = ['marathon-weekly-base', 'marathon-10k-gate'];
    for (const id of promoted) {
      expect(after.segments.find((segment) => segment.id === id)?.parentSegmentId).toBe('marathon-journey');
    }
    const root = after.segments.find((segment) => segment.id === 'marathon-journey')!;
    expect(root.memberNodeIds).toEqual([...new Set(root.memberNodeIds)]);
    expect(root.connectionIds).toEqual([...new Set(root.connectionIds)]);
    expect(root.memberNodeIds).toEqual(expect.arrayContaining(['health-route', 'base-mileage', 'run', 'sleep', 'ten-k-checkpoint']));
    expect(root.connectionIds).toEqual(expect.arrayContaining(['r4', 'r5', 'r21', 'r8', 'r9']));
  });

  it('dissolves a standalone segment by simply releasing its pool', () => {
    const before = createPortraitRoadMapSnapshot();
    const after = LifeMap.create(before).dissolveSegment('health-family-bridge').snapshot();
    expect(after.segments.some((segment) => segment.id === 'health-family-bridge')).toBe(false);
    expect(after.segments).toHaveLength(before.segments.length - 1);
    // Other memberships of the released nodes are untouched.
    expect(after.segments.find((segment) => segment.id === 'marathon-journey')?.memberNodeIds).toContain('sleep');
  });

  it('moves a node across branches, dropping connections its old segments no longer cover', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    const after = map.moveNodeToSegment('sleep', 'marathon-direction').snapshot();
    const marathonSegments = after.segments.filter((segment) => segment.roadId === 'marathon-road');
    expect(marathonSegments.filter((segment) => segment.memberNodeIds.includes('sleep')).map((segment) => segment.id).sort())
      .toEqual(['marathon-direction', 'marathon-journey']);
    // The old branch loses the connections that touched the moved node.
    expect(after.segments.find((segment) => segment.id === 'marathon-weekly-base')?.connectionIds).toEqual(['r4', 'r5']);
    expect(after.segments.find((segment) => segment.id === 'marathon-10k-gate')?.connectionIds).toEqual(['r8']);
    // The standalone bridge is outside the target tree and keeps its member.
    expect(after.segments.find((segment) => segment.id === 'health-family-bridge')?.memberNodeIds).toContain('sleep');
  });

  it('moves a node to the road root, clearing every deeper membership', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    const after = map.moveNodeToSegment('run', 'marathon-journey').snapshot();
    const holders = after.segments
      .filter((segment) => segment.roadId === 'marathon-road' && segment.memberNodeIds.includes('run'))
      .map((segment) => segment.id);
    expect(holders).toEqual(['marathon-journey']);
  });

  it('rejects moving a node across roads but files an unfiled node', () => {
    const map = LifeMap.create(createPortraitRoadMapSnapshot());
    expect(() => map.moveNodeToSegment('weekly-dinner', 'marathon-foundation'))
      .toThrow(expect.objectContaining<Partial<LifeMapError>>({ code: 'invalid-segment' }));
    const after = map.moveNodeToSegment('explore-kyoto', 'marathon-direction').snapshot();
    expect(after.segments.find((segment) => segment.id === 'marathon-direction')?.memberNodeIds).toContain('explore-kyoto');
    expect(after.segments.find((segment) => segment.id === 'marathon-journey')?.memberNodeIds).toContain('explore-kyoto');
  });
});
