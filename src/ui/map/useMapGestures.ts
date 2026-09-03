import { useEffect, useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder } from 'react-native';
import { MapCamera, MapViewport } from '../../application/map/projectionTypes';
import { panCamera, zoomCameraAt } from '../../application/map/camera';

interface GestureOptions {
  camera: MapCamera;
  viewport: MapViewport;
  enabled: boolean;
  /** Suspend single-finger panning while an edit drag handle is on screen, so a
   *  handle drag can never fall through to a map pan. Pinch zoom stays live. */
  panLocked?: boolean;
  onCamera: (camera: MapCamera) => void;
}

const touchDistance = (event: GestureResponderEvent): number => {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return 0;
  return Math.hypot(touches[1].pageX - touches[0].pageX, touches[1].pageY - touches[0].pageY);
};

// Anchors must be viewport-relative: locationX/Y are relative to the canvas
// view, while pageX/Y would be off by the header and safe-area inset.
const touchCenter = (event: GestureResponderEvent) => {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
  return {
    x: (touches[0].locationX + touches[1].locationX) / 2,
    y: (touches[0].locationY + touches[1].locationY) / 2,
  };
};

export const useMapGestures = ({ camera, viewport, enabled, panLocked, onCamera }: GestureOptions) => {
  const current = useRef({ camera, viewport, enabled, panLocked, onCamera });
  const gestureStart = useRef({ camera, distance: 0 });
  const lastCenter = useRef({ x: 0, y: 0 });
  const lastTouchCount = useRef(0);
  const lastTap = useRef(0);
  useEffect(() => {
    current.current = { camera, viewport, enabled, panLocked, onCamera };
  }, [camera, viewport, enabled, panLocked, onCamera]);

  // Spread these on a plain View wrapping the canvas: Pressability overrides
  // onResponderGrant/Move/Release on a Pressable, which silently kills them.
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Claim two-finger touches immediately: a pure pinch barely moves the touch
    // centroid, so the dx/dy threshold alone would never grant the responder.
    onMoveShouldSetPanResponder: (event, gesture) => current.current.enabled
      && (event.nativeEvent.touches.length > 1
        || (!current.current.panLocked && (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4))),
    onPanResponderGrant: (event) => {
      gestureStart.current = { camera: current.current.camera, distance: touchDistance(event) };
      lastCenter.current = touchCenter(event);
      lastTouchCount.current = event.nativeEvent.touches.length;
    },
    onPanResponderMove: (event) => {
      if (!current.current.enabled) return;
      const touches = event.nativeEvent.touches.length;
      const center = touchCenter(event);
      const distance = touchDistance(event);
      if (touches !== lastTouchCount.current) {
        // A finger landed or lifted mid-gesture: re-anchor the baselines so
        // neither the pinch ratio nor the pan delta jumps.
        gestureStart.current = { camera: current.current.camera, distance };
        lastCenter.current = center;
        lastTouchCount.current = touches;
        return;
      }
      if (touches > 1 && distance > 0 && gestureStart.current.distance > 0) {
        current.current.onCamera(zoomCameraAt(
          gestureStart.current.camera,
          distance / gestureStart.current.distance,
          center,
          current.current.viewport,
        ));
      } else {
        current.current.onCamera(panCamera(
          current.current.camera,
          center.x - lastCenter.current.x,
          center.y - lastCenter.current.y,
          current.current.viewport,
        ));
        lastCenter.current = center;
      }
    },
  }), []);

  const onTap = (x: number, y: number) => {
    const now = Date.now();
    if (now - lastTap.current < 300 && current.current.enabled) {
      current.current.onCamera(zoomCameraAt(
        current.current.camera,
        1.35,
        { x, y },
        current.current.viewport,
      ));
    }
    lastTap.current = now;
  };

  const onWheel = (event: { preventDefault?: () => void; nativeEvent?: { deltaY?: number }; deltaY?: number }) => {
    if (!current.current.enabled) return;
    event.preventDefault?.();
    const deltaY = event.nativeEvent?.deltaY ?? event.deltaY ?? 0;
    current.current.onCamera(zoomCameraAt(
      current.current.camera,
      deltaY > 0 ? 0.9 : 1.1,
      { x: current.current.viewport.width / 2, y: current.current.viewport.height / 2 },
      current.current.viewport,
    ));
  };

  return {
    gestureHandlers: { ...panResponder.panHandlers, onWheel } as typeof panResponder.panHandlers & { onWheel: typeof onWheel },
    onTap,
  };
};
