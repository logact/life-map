import { LifeMapSnapshot } from '../entities';

export interface LifeMapRepository {
  load(): Promise<LifeMapSnapshot>;
  save(snapshot: LifeMapSnapshot, expectedVersion: number): Promise<void>;
}
