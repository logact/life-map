import { MapCamera, MapViewport, ScreenPoint } from './projectionTypes';
import { ROAD_WORLD_HEIGHT, ROAD_WORLD_WIDTH, RoadLayoutService } from './RoadLayoutService';

const clampValue = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const clampCamera = (camera: MapCamera, viewport: MapViewport): MapCamera => {
  const scale = clampValue(camera.scale, 0.55, 2.8);
  const halfWorldWidth = viewport.width / (2 * scale);
  const halfWorldHeight = viewport.height / (2 * scale);
  return {
    scale,
    centerX: clampValue(camera.centerX, -halfWorldWidth + 40, ROAD_WORLD_WIDTH + halfWorldWidth - 40),
    centerY: clampValue(camera.centerY, -halfWorldHeight + 40, ROAD_WORLD_HEIGHT + halfWorldHeight - 40),
  };
};

export const panCamera = (camera: MapCamera, deltaScreenX: number, deltaScreenY: number, viewport: MapViewport): MapCamera =>
  clampCamera({
    ...camera,
    centerX: camera.centerX - deltaScreenX / camera.scale,
    centerY: camera.centerY - deltaScreenY / camera.scale,
  }, viewport);

export const zoomCameraAt = (
  camera: MapCamera,
  factor: number,
  anchor: ScreenPoint,
  viewport: MapViewport,
): MapCamera => {
  const layout = new RoadLayoutService();
  const worldAnchor = layout.screenToWorld(anchor, viewport, camera);
  const scale = clampValue(camera.scale * factor, 0.55, 2.8);
  const next = {
    scale,
    centerX: worldAnchor.x - (anchor.x - viewport.width / 2) / scale,
    centerY: worldAnchor.y - (anchor.y - viewport.height / 2) / scale,
  };
  return clampCamera(next, viewport);
};

export const fitCameraToBounds = (
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewport: MapViewport,
  bottomExclusion = 0,
): MapCamera => {
  const padding = 54;
  const availableWidth = Math.max(100, viewport.width - padding * 2);
  const availableHeight = Math.max(100, viewport.height - bottomExclusion - padding * 2);
  const width = Math.max(80, bounds.maxX - bounds.minX);
  const height = Math.max(80, bounds.maxY - bounds.minY);
  return clampCamera({
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2 + bottomExclusion / 2,
    scale: Math.min(2.2, availableWidth / width, availableHeight / height),
  }, viewport);
};

export const focusCameraAboveSheet = (
  camera: MapCamera,
  worldPoint: { x: number; y: number },
  viewport: MapViewport,
  sheetHeight: number,
): MapCamera => clampCamera({
  ...camera,
  centerX: worldPoint.x,
  centerY: worldPoint.y + sheetHeight / (2 * camera.scale),
}, viewport);

export const resetCamera = (): MapCamera => ({ centerX: ROAD_WORLD_WIDTH / 2, centerY: ROAD_WORLD_HEIGHT / 2, scale: 0.7 });
