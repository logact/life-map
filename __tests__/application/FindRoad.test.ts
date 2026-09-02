import { FindRoadService } from '../../src/application/map/FindRoadService';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../../src/infrastructure/memory/portraitRoadMapFixture';

describe('FindRoadService', () => {
  const service = new FindRoadService();
  const snapshot = createPortraitRoadMapSnapshot();
  const layout = createPortraitRoadMapLayout();

  it('prefers fewer failed endpoints before fewer hops', () => {
    const result = service.find(snapshot, layout, 'work-route', 'work');
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.connectionIds).toEqual(['r6', 'r10']);
      expect(result.failedEndpointCount).toBe(0);
      expect(result.requiredSemanticLevel).toBe(2);
    }
  });

  it('returns explicit unreachable results for isolated destinations', () => {
    expect(service.find(snapshot, layout, 'start', 'move-kyoto')).toEqual({
      status: 'unreachable',
      fromNodeId: 'start',
      toNodeId: 'move-kyoto',
    });
  });

  it('returns bounds for camera fitting', () => {
    const result = service.find(snapshot, layout, 'start', 'studio');
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.bounds.maxY).toBeGreaterThan(result.bounds.minY);
      expect(result.nodeIds.at(-1)).toBe('studio');
    }
  });
});
