import { cloneSnapshot, LifeMapSnapshot } from '../../domain/lifeMap/entities';
import { LifeMapError } from '../../domain/lifeMap/LifeMapErrors';
import { LifeMapRepository } from '../../domain/lifeMap/repository/LifeMapRepository';

export class MemoryLifeMapRepository implements LifeMapRepository {
  private state: LifeMapSnapshot;

  constructor(seed: LifeMapSnapshot) {
    this.state = cloneSnapshot(seed);
  }

  async load(): Promise<LifeMapSnapshot> {
    return cloneSnapshot(this.state);
  }

  async save(snapshot: LifeMapSnapshot, expectedVersion: number): Promise<void> {
    if (this.state.version !== expectedVersion) {
      throw new LifeMapError('version-conflict', 'The Life Map changed before this operation could be saved');
    }
    this.state = cloneSnapshot(snapshot);
  }
}
