import { LifeMapSnapshot, MapLayoutSnapshot } from '../../domain/lifeMap/entities';
import { LifeMap } from '../../domain/lifeMap/LifeMap';

const ORIGIN_ID = 'origin';

/** A fresh Life Map: only the permanent origin, no plans, roads, or records. */
export const createEmptyLifeMapSnapshot = (): LifeMapSnapshot =>
  LifeMap.create({
    version: 1,
    nodes: [
      {
        id: ORIGIN_ID,
        kind: 'status',
        permanent: true,
        title: 'Start',
        description: 'The permanent origin of this journey.',
        outcome: 'success',
      },
    ],
    connections: [],
    roads: [],
    segments: [],
    records: [],
  }).snapshot();

/** Layout for the empty map: origin centered in the world (width 390). */
export const createEmptyMapLayout = (): MapLayoutSnapshot => ({
  version: 1,
  placements: [{ nodeId: ORIGIN_ID, worldX: 195, depthRank: 0 }],
  recordPlacements: [],
  bends: [],
});
