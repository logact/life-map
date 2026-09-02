import { CaptureRecord } from '../../src/application/lifeMap/CaptureRecord';
import { EditLifeMap } from '../../src/application/lifeMap/EditLifeMap';
import { MemoryLifeMapRepository } from '../../src/infrastructure/memory/MemoryLifeMapRepository';
import { MemoryMapLayoutRepository } from '../../src/infrastructure/memory/MemoryMapLayoutRepository';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../../src/infrastructure/memory/portraitRoadMapFixture';

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
});
