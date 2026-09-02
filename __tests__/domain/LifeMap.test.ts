import { LifeMap } from '../../src/domain/lifeMap/LifeMap';
import { LifeMapError } from '../../src/domain/lifeMap/LifeMapErrors';
import { createPortraitRoadMapSnapshot } from '../../src/infrastructure/memory/portraitRoadMapFixture';

describe('LifeMap aggregate', () => {
  it('accepts the portrait fixture with one permanent origin and a five-deep segment tree', () => {
    const snapshot = LifeMap.create(createPortraitRoadMapSnapshot()).snapshot();
    expect(snapshot.nodes.filter((node) => node.kind === 'originStatus' && !node.archivedAt)).toHaveLength(1);

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
});
