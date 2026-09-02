import { MemoryLifeMapRepository } from '../../src/infrastructure/memory/MemoryLifeMapRepository';
import { MemoryMapLayoutRepository } from '../../src/infrastructure/memory/MemoryMapLayoutRepository';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../../src/infrastructure/memory/portraitRoadMapFixture';

describe('memory repositories', () => {
  it('enforces optimistic versions and returns defensive copies', async () => {
    const repository = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
    const first = await repository.load();
    first.nodes[0].title = 'mutated copy';
    expect((await repository.load()).nodes[0].title).toBe('Started here');
    await expect(repository.save({ ...first, version: 2 }, 99)).rejects.toMatchObject({ code: 'version-conflict' });
  });

  it('resets editable placements to the deterministic fixture', async () => {
    const repository = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
    const layout = await repository.load();
    const moved = { ...layout, version: 2, placements: layout.placements.map((placement) => placement.nodeId === 'run' ? { ...placement, worldX: 300 } : placement) };
    await repository.save(moved, 1);
    const reset = await repository.reset();
    expect(reset.placements.find((placement) => placement.nodeId === 'run')?.worldX).toBe(35);
  });
});
