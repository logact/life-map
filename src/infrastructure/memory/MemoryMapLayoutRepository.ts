import { cloneLayout, MapLayoutSnapshot } from '../../domain/lifeMap/entities';
import { LifeMapError } from '../../domain/lifeMap/LifeMapErrors';
import { MapLayoutRepository } from '../../domain/lifeMap/repository/MapLayoutRepository';

export class MemoryMapLayoutRepository implements MapLayoutRepository {
  private state: MapLayoutSnapshot;
  private readonly seed: MapLayoutSnapshot;

  constructor(seed: MapLayoutSnapshot) {
    this.state = cloneLayout(seed);
    this.seed = cloneLayout(seed);
  }

  async load(): Promise<MapLayoutSnapshot> {
    return cloneLayout(this.state);
  }

  async save(layout: MapLayoutSnapshot, expectedVersion: number): Promise<void> {
    if (this.state.version !== expectedVersion) {
      throw new LifeMapError('version-conflict', 'The map layout changed before this operation could be saved');
    }
    this.state = cloneLayout(layout);
  }

  async reset(): Promise<MapLayoutSnapshot> {
    this.state = { ...cloneLayout(this.seed), version: this.state.version + 1 };
    return this.load();
  }
}
