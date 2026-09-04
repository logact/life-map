import { FindRoadService } from '../../src/application/map/FindRoadService';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../fixtures/portraitRoadMapFixture';

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
      // None of the route's nodes are filed inside the featured road's tree,
      // so the route is fully visible from the outermost layer.
      expect(result.requiredSemanticLevel).toBe(0);
    }
  });

  it('requires the deepest layer a route touches inside the focused road', () => {
    const result = service.find(snapshot, layout, 'start', 'marathon');
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      // Every marathon node is filed at the atomic layer; only the permanent
      // origin is exempt from raising the required level.
      expect(result.requiredSemanticLevel).toBe(4);
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

  it('previews the best route cost to every reachable destination in one pass', () => {
    const previews = service.previewAll(snapshot, 'start');
    const marathon = previews.find((preview) => preview.toNodeId === 'marathon');
    expect(marathon).toBeDefined();
    expect(marathon!.connectionCount).toBeGreaterThan(0);
    // The best marathon route crosses the failed 10K checkpoint.
    expect(marathon!.failedEndpointCount).toBeGreaterThan(0);
    // The origin itself and the isolated Kyoto branch are not destinations.
    expect(previews.some((preview) => preview.toNodeId === 'start')).toBe(false);
    expect(previews.some((preview) => preview.toNodeId === 'move-kyoto')).toBe(false);
  });

  it('returns no previews for an unknown origin', () => {
    expect(service.previewAll(snapshot, 'missing')).toEqual([]);
  });

  describe('findAll', () => {
    it('ranks every path best-first', () => {
      const paths = service.findAll(snapshot, layout, 'work-route', 'work');
      expect(paths.map((path) => path.connectionIds)).toEqual([['r6', 'r10'], ['r7', 'r11']]);
      expect(paths[0].failedEndpointCount).toBe(0);
      expect(paths[1].failedEndpointCount).toBe(1);
    });

    it('keeps the best path first, matching find', () => {
      const best = service.find(snapshot, layout, 'start', 'marathon');
      const all = service.findAll(snapshot, layout, 'start', 'marathon');
      expect(best.status).toBe('found');
      if (best.status === 'found') expect(all[0].connectionIds).toEqual(best.connectionIds);
      expect(all.length).toBeGreaterThan(1);
    });

    it('returns a single result when only one path exists', () => {
      const paths = service.findAll(snapshot, layout, 'start', 'plan-home');
      expect(paths).toHaveLength(1);
      expect(paths[0].connectionIds).toEqual(['r14']);
    });

    it('returns an empty list for unreachable or unknown endpoints', () => {
      expect(service.findAll(snapshot, layout, 'start', 'move-kyoto')).toEqual([]);
      expect(service.findAll(snapshot, layout, 'missing', 'work')).toEqual([]);
    });

    it('slices the ranked alternatives to the limit', () => {
      expect(service.findAll(snapshot, layout, 'start', 'marathon', 1)).toHaveLength(1);
      expect(service.findAll(snapshot, layout, 'start', 'marathon')).toHaveLength(2);
    });
  });
});
