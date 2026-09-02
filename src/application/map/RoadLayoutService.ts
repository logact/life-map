import { MapLayoutSnapshot, MapPlacement } from '../../domain/lifeMap/entities';
import { MapCamera, MapViewport, ScreenPoint, WorldPoint } from './projectionTypes';

export const ROAD_WORLD_WIDTH = 390;
export const ROAD_WORLD_HEIGHT = 720;
export const ROAD_BOTTOM_Y = 640;
export const ROAD_RANK_GAP = 71.25;

export class RoadLayoutService {
  worldY(placement: MapPlacement): number {
    return placement.inlineWorldY ?? ROAD_BOTTOM_Y - placement.depthRank * ROAD_RANK_GAP;
  }

  worldToScreen(point: WorldPoint, viewport: MapViewport, camera: MapCamera): ScreenPoint {
    return {
      x: viewport.width / 2 + (point.x - camera.centerX) * camera.scale,
      y: viewport.height / 2 + (point.y - camera.centerY) * camera.scale,
    };
  }

  screenToWorld(point: ScreenPoint, viewport: MapViewport, camera: MapCamera): WorldPoint {
    return {
      x: camera.centerX + (point.x - viewport.width / 2) / camera.scale,
      y: camera.centerY + (point.y - viewport.height / 2) / camera.scale,
    };
  }

  withMovedNode(layout: MapLayoutSnapshot, nodeId: string, worldX: number, depthRank: number): MapLayoutSnapshot {
    const next = {
      ...layout,
      version: layout.version + 1,
      placements: layout.placements.map((placement) =>
        placement.nodeId === nodeId ? { ...placement, worldX, depthRank, inlineWorldY: undefined } : { ...placement },
      ),
      recordPlacements: layout.recordPlacements.map((placement) => ({ ...placement })),
      bends: layout.bends.map((bend) => ({ ...bend })),
    };
    if (!next.placements.some((placement) => placement.nodeId === nodeId)) {
      next.placements.push({ nodeId, worldX, depthRank });
    }
    return next;
  }

  withMovedRecord(layout: MapLayoutSnapshot, recordId: string, worldX: number, worldY: number): MapLayoutSnapshot {
    const next = {
      ...layout,
      version: layout.version + 1,
      placements: layout.placements.map((placement) => ({ ...placement })),
      recordPlacements: layout.recordPlacements.map((placement) =>
        placement.recordId === recordId ? { ...placement, worldX, worldY } : { ...placement },
      ),
      bends: layout.bends.map((bend) => ({ ...bend })),
    };
    if (!next.recordPlacements.some((placement) => placement.recordId === recordId)) {
      next.recordPlacements.push({ recordId, worldX, worldY });
    }
    return next;
  }

  withConnectionBend(layout: MapLayoutSnapshot, connectionId: string, offsetX: number, offsetY: number): MapLayoutSnapshot {
    const next = {
      ...layout,
      version: layout.version + 1,
      placements: layout.placements.map((placement) => ({ ...placement })),
      recordPlacements: layout.recordPlacements.map((placement) => ({ ...placement })),
      bends: layout.bends.map((bend) =>
        bend.connectionId === connectionId ? { connectionId, offsetX, offsetY } : { ...bend },
      ),
    };
    if (!next.bends.some((bend) => bend.connectionId === connectionId)) {
      next.bends.push({ connectionId, offsetX, offsetY });
    }
    return next;
  }
}
