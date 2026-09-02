import { MapLayoutSnapshot } from '../entities';

export interface MapLayoutRepository {
  load(): Promise<MapLayoutSnapshot>;
  save(layout: MapLayoutSnapshot, expectedVersion: number): Promise<void>;
  reset(): Promise<MapLayoutSnapshot>;
}
