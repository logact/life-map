import { CaptureRecord } from '../../src/application/lifeMap/CaptureRecord';
import { EditLifeMap } from '../../src/application/lifeMap/EditLifeMap';
import { LifeMapSnapshot } from '../../src/domain/lifeMap/entities';
import { MemoryLifeMapRepository } from '../../src/infrastructure/memory/MemoryLifeMapRepository';
import { MemoryMapLayoutRepository } from '../../src/infrastructure/memory/MemoryMapLayoutRepository';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../fixtures/portraitRoadMapFixture';

/** Shallow tree: the portrait fixture's five levels are saturated, so a grouping that reparents children needs room. */
const shallowSnapshot = (): LifeMapSnapshot => ({
  version: 1,
  nodes: [
    { id: 'start', kind: 'status', title: 'Start', description: '', outcome: 'success', permanent: true },
    { id: 'a', kind: 'task', title: 'A', description: '', outcome: 'todo' },
    { id: 'b', kind: 'task', title: 'B', description: '', outcome: 'todo' },
    { id: 'g', kind: 'goal', title: 'G', description: '', outcome: 'todo' },
  ],
  connections: [
    { id: 'c1', fromNodeId: 'start', toNodeId: 'a', meaning: 'begins' },
    { id: 'c2', fromNodeId: 'a', toNodeId: 'b', meaning: 'then' },
    { id: 'c3', fromNodeId: 'b', toNodeId: 'g', meaning: 'lands' },
  ],
  roads: [{ id: 'road', title: 'Road', description: '', destinationGoalId: 'g', rootSegmentId: 'root' }],
  segments: [
    { id: 'root', roadId: 'road', title: 'Root', description: '', memberNodeIds: ['start', 'a', 'b', 'g'], connectionIds: ['c1', 'c2', 'c3'] },
    { id: 'child-x', roadId: 'road', parentSegmentId: 'root', title: 'X', description: '', memberNodeIds: ['start', 'a'], connectionIds: ['c1'] },
    { id: 'child-y', roadId: 'road', parentSegmentId: 'root', title: 'Y', description: '', memberNodeIds: ['b', 'g'], connectionIds: ['c3'] },
  ],
  records: [],
});

describe('editing use cases', () => {
  it('moves semantic nodes without changing topology and moves Records without retargeting them', async () => {
    const maps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.moveNode('run', 90, 4);
    await edits.moveRecord('record-run', 28, 380);
    expect((await layouts.load()).placements.find((placement) => placement.nodeId === 'run')?.worldX).toBe(90);
    expect((await maps.load()).records.find((record) => record.id === 'record-run')?.targetId).toBe('run');
  });

  it('captures required Record text at an exact eligible target', async () => {
    const maps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const capture = new CaptureRecord(maps, layouts);
    await capture.execute({ id: 'record-new', targetId: 'run', occurredAt: '2026-09-02T08:00:00.000Z', summary: 'Felt smooth' });
    expect((await maps.load()).records.find((record) => record.id === 'record-new')?.targetId).toBe('run');
    expect((await layouts.load()).recordPlacements.some((placement) => placement.recordId === 'record-new')).toBe(true);
  });

  it('groups nodes and child segments into a sub-segment, ignoring non-children', async () => {
    const maps = new MemoryLifeMapRepository(shallowSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.groupIntoSubSegment({
      id: 'grouped',
      title: 'Grouped',
      parentSegmentId: 'root',
      memberNodeIds: ['a', 'g'],
      childSegmentIds: ['child-x', 'missing-child'],
    });
    const snapshot = await maps.load();
    const created = snapshot.segments.find((segment) => segment.id === 'grouped')!;
    expect(created.parentSegmentId).toBe('root');
    expect(created.roadId).toBe('road');
    // 'a' and 'g' from the selection, plus child-x's members; only c1 links two members.
    expect(created.memberNodeIds).toEqual(['a', 'g', 'start']);
    expect(created.connectionIds).toEqual(['c1']);
    expect(snapshot.segments.find((segment) => segment.id === 'child-x')?.parentSegmentId).toBe('grouped');
    expect(snapshot.segments.find((segment) => segment.id === 'child-y')?.parentSegmentId).toBe('root');
  });

  it('keeps grouping membership inside the parent segment', async () => {
    const maps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.groupIntoSubSegment({
      id: 'recovery',
      title: 'Recovery',
      parentSegmentId: 'marathon-weekly-base',
      memberNodeIds: ['run', 'sleep', 'choose'],
      childSegmentIds: [],
    });
    const created = (await maps.load()).segments.find((segment) => segment.id === 'recovery')!;
    // 'choose' belongs to another branch and is dropped; no parent-pool connection links run and sleep.
    expect(created.memberNodeIds).toEqual(['run', 'sleep']);
    expect(created.connectionIds).toEqual([]);
  });

  it('creates a sub-segment for a connection under the deepest container with room', async () => {
    const maps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.createSubSegmentForConnection({ id: 'seg-r5', connectionId: 'r5', title: 'Weekly practice' });
    const created = (await maps.load()).segments.find((segment) => segment.id === 'seg-r5')!;
    // r5's deepest container is an atomic segment at level 4, so the parent is its level-3 node group.
    expect(created.parentSegmentId).toBe('marathon-weekly-base-node-group');
    expect(created.roadId).toBe('marathon-road');
    expect(created.memberNodeIds).toEqual(['base-mileage', 'run']);
    expect(created.connectionIds).toEqual(['r5']);
  });

  it('creates a standalone segment for a connection no segment contains', async () => {
    const maps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.connect({ id: 'kyoto-link', fromNodeId: 'explore-kyoto', toNodeId: 'move-kyoto', meaning: 'commits' });
    await edits.createSubSegmentForConnection({ id: 'seg-kyoto', connectionId: 'kyoto-link', title: 'Kyoto move' });
    const created = (await maps.load()).segments.find((segment) => segment.id === 'seg-kyoto')!;
    expect(created.roadId).toBeUndefined();
    expect(created.parentSegmentId).toBeUndefined();
    expect(created.connectionIds).toEqual(['kyoto-link']);
  });

  it('dissolves a segment through the repository', async () => {
    const maps = new MemoryLifeMapRepository(shallowSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.dissolveSegment('child-x');
    const snapshot = await maps.load();
    expect(snapshot.segments.some((segment) => segment.id === 'child-x')).toBe(false);
    expect(snapshot.segments.find((segment) => segment.id === 'root')?.memberNodeIds).toEqual(['start', 'a', 'b', 'g']);
    await expect(edits.dissolveSegment('root')).rejects.toMatchObject({ code: 'invalid-operation' });
  });

  it('reparents a segment as a command and rejects a containment-breaking move', async () => {
    const maps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.reparentSegment('marathon-10k-gate', 'marathon-journey');
    expect((await maps.load()).segments.find((segment) => segment.id === 'marathon-10k-gate')?.parentSegmentId)
      .toBe('marathon-journey');
    // marathon-direction's pool does not cover the gate's members.
    await expect(edits.reparentSegment('marathon-10k-gate', 'marathon-direction'))
      .rejects.toMatchObject({ code: 'invalid-segment' });
  });

  it('moves a node to another segment of its road', async () => {
    const maps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const edits = new EditLifeMap(maps, layouts);
    await edits.moveNodeToSegment('run', 'marathon-journey');
    const snapshot = await maps.load();
    const holders = snapshot.segments
      .filter((segment) => segment.roadId === 'marathon-road' && segment.memberNodeIds.includes('run'))
      .map((segment) => segment.id);
    expect(holders).toEqual(['marathon-journey']);
    await expect(edits.moveNodeToSegment('weekly-dinner', 'marathon-journey'))
      .rejects.toMatchObject({ code: 'invalid-segment' });
  });
});
