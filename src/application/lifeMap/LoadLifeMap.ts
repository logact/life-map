import { PortraitMapProjectionService, ProjectionRequest } from '../map/PortraitMapProjectionService';
import { PortraitMapProjection } from '../map/projectionTypes';
import { LifeMapSnapshot, MapLayoutSnapshot } from '../../domain/lifeMap/entities';
import { LifeMapRepository } from '../../domain/lifeMap/repository/LifeMapRepository';
import { MapLayoutRepository } from '../../domain/lifeMap/repository/MapLayoutRepository';

export type LoadProjectionRequest = Omit<ProjectionRequest, 'snapshot' | 'layout'>;

export class LoadLifeMap {
  private lastData?: { snapshot: LifeMapSnapshot; layout: MapLayoutSnapshot };

  constructor(
    private readonly lifeMaps: LifeMapRepository,
    private readonly layouts: MapLayoutRepository,
    private readonly projectionService = new PortraitMapProjectionService(),
  ) {}

  async execute(request: LoadProjectionRequest): Promise<PortraitMapProjection> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    this.lastData = { snapshot, layout };
    return this.projectionService.project({ ...request, snapshot, layout });
  }

  /**
   * Synchronous re-projection from the most recently loaded data. Camera,
   * focus, filter, and route changes never touch the repositories, so they
   * must not wait on an async load — otherwise every pan frame renders with
   * a stale projection and the map visibly flickers.
   */
  reproject(request: LoadProjectionRequest): PortraitMapProjection | undefined {
    if (!this.lastData) return undefined;
    return this.projectionService.project({ ...request, ...this.lastData });
  }
}
