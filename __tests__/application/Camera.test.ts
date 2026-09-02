import { fitCameraToBounds, focusCameraAboveSheet, panCamera, resetCamera, zoomCameraAt } from '../../src/application/map/camera';
import { RoadLayoutService } from '../../src/application/map/RoadLayoutService';

describe('camera helpers', () => {
  const viewport = { width: 390, height: 720 };
  const layout = new RoadLayoutService();

  it('preserves the world point under an anchored zoom', () => {
    const camera = resetCamera();
    const anchor = { x: 80, y: 160 };
    const before = layout.screenToWorld(anchor, viewport, camera);
    const afterCamera = zoomCameraAt(camera, 1.4, anchor, viewport);
    const after = layout.screenToWorld(anchor, viewport, afterCamera);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('pans, fits routes, and offsets focus above a sheet', () => {
    expect(panCamera(resetCamera(), 20, 0, viewport).centerX).toBeLessThan(resetCamera().centerX);
    const fit = fitCameraToBounds({ minX: 40, minY: 70, maxX: 330, maxY: 640 }, viewport, 180);
    expect(fit.scale).toBeGreaterThanOrEqual(0.55);
    expect(focusCameraAboveSheet(fit, { x: 100, y: 200 }, viewport, 180).centerY).toBeGreaterThan(200);
  });
});
