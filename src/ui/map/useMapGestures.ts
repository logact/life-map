import { useEffect, useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder } from 'react-native';
import { MapCamera, MapViewport } from '../../application/map/projectionTypes';
import { panCamera, zoomCameraAt } from '../../application/map/camera';

interface GestureOptions {
  camera: MapCamera;
  viewport: MapViewport;
  enabled: boolean;
  onCamera: (camera: MapCamera) => void;
}

const touchDistance = (event: GestureResponderEvent): number => {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return 0;
  return Math.hypot(touches[1].pageX - touches[0].pageX, touches[1].pageY - touches[0].pageY);
};

const touchCenter = (event: GestureResponderEvent) => {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
  return {
    x: (touches[0].pageX + touches[1].pageX) / 2,
    y: (touches[0].pageY + touches[1].pageY) / 2,
  };
};

export const useMapGestures = ({ camera, viewport, enabled, onCamera }: GestureOptions) => {
  const current = useRef({ camera, viewport, enabled, onCamera });
  const gestureStart = useRef({ camera, distance: 0 });
  const lastTap = useRef(0);
  useEffect(() => {
    current.current = { camera, viewport, enabled, onCamera };
  }, [camera, viewport, enabled, onCamera]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => current.current.enabled && (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4),
    onPanResponderGrant: (event) => {
      gestureStart.current = { camera: current.current.camera, distance: touchDistance(event) };
    },
    onPanResponderMove: (event, gesture) => {
      if (!current.current.enabled) return;
      const distance = touchDistance(event);
      if (distance > 0 && gestureStart.current.distance > 0) {
        current.current.onCamera(zoomCameraAt(
          gestureStart.current.camera,
          distance / gestureStart.current.distance,
          touchCenter(event),
          current.current.viewport,
        ));
      } else {
        current.current.onCamera(panCamera(gestureStart.current.camera, gesture.dx, gesture.dy, current.current.viewport));
      }
    },
    onPanResponderRelease: (event) => {
      const now = Date.now();
      if (now - lastTap.current < 300 && current.current.enabled) {
        current.current.onCamera(zoomCameraAt(
          current.current.camera,
          1.35,
          { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
          current.current.viewport,
        ));
      }
      lastTap.current = now;
    },
  }), []);

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

  return { ...panResponder.panHandlers, onWheel } as typeof panResponder.panHandlers & { onWheel: typeof onWheel };
};
