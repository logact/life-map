import { LoadLifeMap, LoadProjectionRequest } from '../../src/application/lifeMap/LoadLifeMap';
import { panCamera, resetCamera } from '../../src/application/map/camera';
import { MemoryLifeMapRepository } from '../../src/infrastructure/memory/MemoryLifeMapRepository';
import { MemoryMapLayoutRepository } from '../../src/infrastructure/memory/MemoryMapLayoutRepository';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../fixtures/portraitRoadMapFixture';

const viewport = { width: 390, height: 720 };

const build = () => {
  const lifeMaps = new MemoryLifeMapRepository(createPortraitRoadMapSnapshot());
  const layouts = new MemoryMapLayoutRepository(createPortraitRoadMapLayout());
  const useCase = new LoadLifeMap(lifeMaps, layouts);
  return { lifeMaps, layouts, useCase };
};

const request = (overrides: Partial<LoadProjectionRequest> = {}): LoadProjectionRequest => ({
  viewport,
  camera: resetCamera(),
  semanticLevel: 4,
  ...overrides,
});

describe('LoadLifeMap reprojection', () => {
  it('returns undefined before the first load', () => {
    const { useCase } = build();
    expect(useCase.reproject(request())).toBeUndefined();
  });

  it('re-projects camera pans synchronously without touching the repositories again', async () => {
    const { lifeMaps, layouts, useCase } = build();
    const base = await useCase.execute(request());
    const lifeMapLoads = jest.spyOn(lifeMaps, 'load');
    const layoutLoads = jest.spyOn(layouts, 'load');

    const panned = panCamera(resetCamera(), 40, -25, viewport);
    const next = useCase.reproject(request({ camera: panned }));

    expect(lifeMapLoads).not.toHaveBeenCalled();
    expect(layoutLoads).not.toHaveBeenCalled();
    const before = base.nodes.find((node) => node.id === 'start')!;
    const after = next!.nodes.find((node) => node.id === 'start')!;
    // A 40px rightward / 25px upward drag shifts every marker by the same delta.
    expect(after.x).toBeCloseTo(before.x + 40);
    expect(after.y).toBeCloseTo(before.y - 25);
  });
});
