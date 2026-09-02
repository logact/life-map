import { PortraitMapProjectionService, ProjectionRequest } from '../map/PortraitMapProjectionService';
import { PortraitMapProjection } from '../map/projectionTypes';
import { LifeMapRepository } from '../../domain/lifeMap/repository/LifeMapRepository';
import { MapLayoutRepository } from '../../domain/lifeMap/repository/MapLayoutRepository';

export type LoadProjectionRequest = Omit<ProjectionRequest, 'snapshot' | 'layout'>;

export class LoadLifeMap {
  constructor(
    private readonly lifeMaps: LifeMapRepository,
    private readonly layouts: MapLayoutRepository,
    private readonly projectionService = new PortraitMapProjectionService(),
  ) {}

  async execute(request: LoadProjectionRequest): Promise<PortraitMapProjection> {
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    return this.projectionService.project({ ...request, snapshot, layout });
  }
}
