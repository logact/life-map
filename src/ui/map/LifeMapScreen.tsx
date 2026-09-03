import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadProjectionRequest } from '../../application/lifeMap/LoadLifeMap';
import { PortraitMapProjection, ScreenPoint } from '../../application/map/projectionTypes';
import { ROAD_BOTTOM_Y, ROAD_RANK_GAP, RoadLayoutService } from '../../application/map/RoadLayoutService';
import { clampCamera, fitCameraToBounds, focusCameraAboveSheet, zoomCameraAt } from '../../application/map/camera';
import { minScaleForSemanticLevel } from '../../application/map/semanticZoom';
import { LifeMapError } from '../../domain/lifeMap/LifeMapErrors';
import { useLifeMapRuntime } from '../composition/LifeMapProvider';
import { RuntimeNodeOption, RuntimeSegmentOption } from '../composition/createLifeMapRuntime';
import { ComposerPreview, LifeMapCanvas } from './LifeMapCanvas';
import { MapBottomSheet } from './MapBottomSheet';
import { MapControls } from './MapControls';
import { MapHeader } from './MapHeader';
import { MapHint } from './MapHint';
import { quadraticPointAt } from './mapGeometry';
import { mapTheme } from './mapTheme';
import { selectionFocusPoint } from './selectionFocus';
import { useLifeMapSession } from './useLifeMapSession';
import { useMapGestures } from './useMapGestures';
import { useReducedMotion } from './useReducedMotion';

export const LifeMapScreen = () => {
  const runtime = useLifeMapRuntime();
  const [session, dispatch] = useLifeMapSession();
  const window = useWindowDimensions();
  const [mapSize, setMapSize] = useState({ width: Math.min(window.width, 520), height: Math.max(420, window.height - 120) });
  const [dataStamp, setDataStamp] = useState(0);
  const previousProjection = useRef<PortraitMapProjection | undefined>(undefined);
  const latestRequest = useRef<LoadProjectionRequest | undefined>(undefined);
  const [options, setOptions] = useState<RuntimeNodeOption[]>([]);
  const [segments, setSegments] = useState<RuntimeSegmentOption[]>([]);
  const [error, setError] = useState<string>();
  const [sparkIds, setSparkIds] = useState<string[]>([]);
  const sparkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const layoutService = useRef(new RoadLayoutService()).current;
  const reducedMotion = useReducedMotion();
  const viewport = { width: mapSize.width, height: mapSize.height };

  const request: LoadProjectionRequest = {
    viewport,
    camera: session.camera,
    semanticLevel: session.semanticLevel,
    focus: session.selection && session.selection.type !== 'summary'
      ? { type: session.selection.type, id: session.selection.id }
      : undefined,
    outcomeFilters: session.filters,
    activeRoute: session.activeRoute,
  };
  latestRequest.current = request;

  // Camera/focus/filter changes re-project synchronously from cached data.
  // Routing every pan frame through the async repository load painted stale
  // projections between updates, which made the map flicker while dragging.
  const projection = useMemo(
    () => runtime.reproject(request) ?? previousProjection.current,
    // dataStamp re-projects after the cached repository data is refreshed.
    [runtime, session.camera, session.semanticLevel, session.selection, session.filters, session.activeRoute, mapSize, dataStamp],
  );

  useEffect(() => { previousProjection.current = projection; }, [projection]);

  // Async repository loads run only on mount and after mutations; everything
  // else is covered by the synchronous re-projection above.
  const load = useCallback(async () => {
    try {
      await runtime.load(latestRequest.current!);
      setOptions(await runtime.options());
      setSegments(await runtime.segmentOptions());
      setDataStamp((stamp) => stamp + 1);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [runtime]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => () => {
    if (sparkTimer.current) clearTimeout(sparkTimer.current);
  }, []);

  const runMutation = async <T,>(operation: () => Promise<T>, success?: string): Promise<T | undefined> => {
    try {
      const before = previousProjection.current;
      const result = await operation();
      dispatch({ type: 'close-sheet' });
      if (success) dispatch({ type: 'toast', message: success });
      await load();
      const after = runtime.reproject(latestRequest.current!);
      if (before && after) {
        const known = new Set(before.connections.map((connection) => connection.id));
        const fresh = after.connections.filter((connection) => !known.has(connection.id)).map((connection) => connection.id);
        if (fresh.length > 0) {
          setSparkIds(fresh);
          if (sparkTimer.current) clearTimeout(sparkTimer.current);
          sparkTimer.current = setTimeout(() => setSparkIds([]), 1500);
        }
      }
      return result;
    } catch (caught) {
      const message = caught instanceof LifeMapError ? caught.message : caught instanceof Error ? caught.message : String(caught);
      dispatch({ type: 'toast', message });
      return undefined;
    }
  };

  // Enabled in edit mode too: pinch is the only way to reach deeper levels,
  // and node/record drags still win because their views claim the responder first.
  // While an edit drag handle is visible the single-finger pan is locked, so a
  // handle drag can never fall through and pan the map instead.
  const gestures = useMapGestures({
    camera: session.camera,
    viewport,
    enabled: !session.sheet,
    panLocked: session.mode === 'edit' && (session.selection?.type === 'node' || session.selection?.type === 'connection'),
    onCamera: (camera) => dispatch({ type: 'set-camera', camera }),
  });

  const onMapLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== mapSize.width || height !== mapSize.height)) setMapSize({ width, height });
  };

  const handleMoveNode = (id: string, screenX: number, screenY: number) => {
    const world = layoutService.screenToWorld({ x: screenX, y: screenY }, viewport, session.camera);
    const depthRank = Math.max(0, Math.min(8, Math.round((ROAD_BOTTOM_Y - world.y) / ROAD_RANK_GAP)));
    void runMutation(() => runtime.moveNode(id, Math.max(8, Math.min(382, world.x)), depthRank), 'Placement updated');
  };

  const handleMoveRecord = (id: string, screenX: number, screenY: number) => {
    const world = layoutService.screenToWorld({ x: screenX, y: screenY }, viewport, session.camera);
    void runMutation(() => runtime.moveRecord(id, world.x, world.y), 'Record placement updated');
  };

  const nearestNodeTo = (screenX: number, screenY: number, excludeId: string) =>
    projection!.nodes
      .filter((node) => node.id !== excludeId)
      .map((node) => ({ node, distance: Math.hypot(node.x - screenX, node.y - screenY) }))
      .sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id))[0];

  /**
   * Layer-local creation: a drop inside a current-level segment frame joins
   * that segment. Sibling frames can overlap, so the smallest containing frame
   * (the most specific layer) wins.
   */
  const segmentIdAtPoint = (screenX: number, screenY: number): string | undefined =>
    projection?.segmentOverlays
      .filter((overlay) => !overlay.dimmed
        && screenX >= overlay.bounds.x && screenX <= overlay.bounds.x + overlay.bounds.width
        && screenY >= overlay.bounds.y && screenY <= overlay.bounds.y + overlay.bounds.height)
      .sort((left, right) =>
        (left.bounds.width * left.bounds.height) - (right.bounds.width * right.bounds.height)
        || left.id.localeCompare(right.id))[0]?.id;

  const handlePathDrag = (nodeId: string, point?: ScreenPoint) => {
    if (!point) {
      dispatch({ type: 'set-draft-path' });
      return;
    }
    const nearest = nearestNodeTo(point.x, point.y, nodeId);
    dispatch({
      type: 'set-draft-path',
      draft: { fromNodeId: nodeId, x: point.x, y: point.y, targetNodeId: nearest && nearest.distance <= 66 ? nearest.node.id : undefined },
    });
  };

  const handlePathDrop = (nodeId: string, screenX: number, screenY: number) => {
    const source = projection.nodes.find((node) => node.id === nodeId);
    if (!source) return;
    if (source.depthRank >= 8) {
      dispatch({ type: 'toast', message: 'A destination at the top has no forward depth available.' });
      return;
    }
    const nearest = nearestNodeTo(screenX, screenY, nodeId);
    if (nearest && nearest.distance <= 66) {
      if (nearest.node.depthRank <= source.depthRank) {
        dispatch({ type: 'toast', message: 'Paths must move forward toward the top' });
        return;
      }
      const duplicate = projection.connections.some((connection) => connection.fromNodeId === nodeId && connection.toNodeId === nearest.node.id);
      if (duplicate) {
        dispatch({ type: 'toast', message: 'Those nodes already have a path' });
        return;
      }
      void runMutation(() => runtime.connect(nodeId, nearest.node.id), `New segment: ${source.title} → ${nearest.node.title}`);
      return;
    }
    const world = layoutService.screenToWorld({ x: screenX, y: screenY }, viewport, session.camera);
    dispatch({ type: 'open-composer', point: {
      worldX: Math.max(8, Math.min(382, world.x)),
      depthRank: Math.max(source.depthRank + 1, Math.min(8, Math.round((ROAD_BOTTOM_Y - world.y) / ROAD_RANK_GAP))),
      fromNodeId: nodeId,
      segmentId: segmentIdAtPoint(screenX, screenY),
    } });
  };

  const handleEdgeLongPress = (connectionId: string) => {
    if (session.mode !== 'edit') return;
    const connection = projection.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) return;
    const midpoint = quadraticPointAt(connection.from, connection.control, connection.to, 0.5);
    const world = layoutService.screenToWorld(midpoint, viewport, session.camera);
    dispatch({ type: 'open-composer', point: {
      worldX: Math.max(8, Math.min(382, world.x)),
      depthRank: Math.max(1, Math.min(8, Math.round((ROAD_BOTTOM_Y - world.y) / ROAD_RANK_GAP))),
      connectionId,
    } });
  };

  const handleBendDrop = (connectionId: string, screenX: number, screenY: number) => {
    const connection = projection.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) return;
    const midpoint = { x: (connection.from.x + connection.to.x) / 2, y: (connection.from.y + connection.to.y) / 2 };
    void runMutation(
      () => runtime.bendConnection(connectionId, (screenX - midpoint.x) / session.camera.scale, (screenY - midpoint.y) / session.camera.scale),
      'Edge curve moved',
    );
  };

  const handleFindRoad = async (fromNodeId: string, toNodeId: string) => {
    const fromTitle = options.find((option) => option.id === fromNodeId)?.title ?? 'Start';
    const toTitle = options.find((option) => option.id === toNodeId)?.title ?? 'that destination';
    const result = await runtime.findRoad(fromNodeId, toNodeId);
    if (result.status === 'unreachable') {
      dispatch({ type: 'toast', message: `No road from ${fromTitle} to ${toTitle} yet · connect this node first` });
      return;
    }
    dispatch({ type: 'show-route', route: result });
    const fit = fitCameraToBounds(result.bounds, viewport, 80);
    const routeMinScale = minScaleForSemanticLevel(result.requiredSemanticLevel);
    dispatch({ type: 'set-camera', camera: fit.scale >= routeMinScale ? fit : { ...fit, scale: routeMinScale } });
    dispatch({ type: 'toast', message: `Showing road to ${toTitle}` });
  };

  const handleQueryRoutes = useCallback((fromNodeId: string) => runtime.routePreviews(fromNodeId), [runtime]);

  const handleComposerDraft = useCallback((draft: { title: string; kind: 'task' | 'status' | 'goal'; outcome: 'success' | 'todo' | 'failed' }) => {
    dispatch({ type: 'set-composer-draft', draft });
  }, []);

  /**
   * After creating a sub-segment, step into its layer: find the level where the
   * new segment would render and center the camera on it. Standalone segments
   * never appear in overlays, so for them this quietly does nothing.
   */
  const stepIntoSegment = (segmentId: string) => {
    for (let level = 0; level <= 4; level += 1) {
      const scale = minScaleForSemanticLevel(level);
      const cameraAtLevel = { ...session.camera, scale };
      const overlay = runtime.reproject({
        ...latestRequest.current!,
        focus: { type: 'segment', id: segmentId },
        camera: cameraAtLevel,
        semanticLevel: level,
      })?.segmentOverlays.find((candidate) => candidate.id === segmentId);
      if (overlay) {
        const center = { x: overlay.bounds.x + overlay.bounds.width / 2, y: overlay.bounds.y + overlay.bounds.height / 2 };
        const world = layoutService.screenToWorld(center, viewport, cameraAtLevel);
        dispatch({ type: 'set-camera', camera: clampCamera({ centerX: world.x, centerY: world.y, scale }, viewport) });
        dispatch({ type: 'close-sheet' });
        return;
      }
    }
  };

  if (!projection && !error) {
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={styles.center}><ActivityIndicator color={mapTheme.forest} /><Text style={styles.loading}>Preparing your roads…</Text></View></SafeAreaView>;
  }
  if (error && !projection) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.errorTitle}>The map could not be loaded</Text><Text style={styles.errorBody}>{error}</Text><Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View></SafeAreaView>;
  }
  if (!projection) return null;

  const routeActive = !!session.activeRoute;

  let composerPreview: ComposerPreview | undefined;
  if (session.sheet === 'composer' && session.composerPoint) {
    const point = session.composerPoint;
    let screenPoint: ScreenPoint | undefined;
    if (point.connectionId) {
      const connection = projection.connections.find((candidate) => candidate.id === point.connectionId);
      if (connection) screenPoint = quadraticPointAt(connection.from, connection.control, connection.to, 0.5);
    }
    if (!screenPoint) {
      screenPoint = layoutService.worldToScreen({ x: point.worldX, y: ROAD_BOTTOM_Y - point.depthRank * ROAD_RANK_GAP }, viewport, session.camera);
    }
    composerPreview = {
      x: screenPoint.x,
      y: screenPoint.y,
      title: session.composerDraft?.title ?? '',
      kind: session.composerDraft?.kind ?? 'task',
      outcome: session.composerDraft?.outcome ?? 'todo',
      fromNodeId: point.fromNodeId,
      connectionId: point.connectionId,
    };
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.phoneColumn}>
        <MapHeader
          summary={projection.headerSummary}
          onRoute={() => dispatch({ type: 'open-sheet', sheet: 'route' })}
          onReset={() => dispatch({ type: 'reset-camera' })}
          onClearRoute={() => dispatch({ type: 'clear-route' })}
        />
        <View style={styles.mapArea} onLayout={onMapLayout}>
          <LifeMapCanvas
            projection={projection}
            width={mapSize.width}
            height={mapSize.height}
            mode={session.mode}
            gestureHandlers={gestures.gestureHandlers}
            selected={session.selection}
            routeActive={routeActive}
            reducedMotion={reducedMotion}
            draftPath={session.draftPath}
            composerPreview={composerPreview}
            sparkConnectionIds={sparkIds}
            onSelect={(incoming) => {
              let selection = incoming;
              if (incoming.type === 'node') {
                // Two-tap edge selection: a second node tap resolves the edge
                // between the pending start endpoint and this node. No edge —
                // the tap stays a plain node select and re-arms the start.
                const startId = session.edgeStartNodeId;
                const edge = startId && startId !== incoming.id
                  ? projection.connections.find((candidate) =>
                      (candidate.fromNodeId === startId && candidate.toNodeId === incoming.id)
                      || (candidate.fromNodeId === incoming.id && candidate.toNodeId === startId))
                  : undefined;
                if (edge) {
                  dispatch({ type: 'set-edge-start' });
                  selection = { type: 'connection', id: edge.id };
                } else {
                  dispatch({ type: 'set-edge-start', id: incoming.id });
                }
              } else {
                dispatch({ type: 'set-edge-start' });
              }
              if (selection.type === 'summary') {
                // A summary road hides detail nodes — tapping it zooms in to reveal them.
                dispatch({ type: 'select', selection });
                const point = selectionFocusPoint(selection, projection);
                if (point) dispatch({ type: 'set-camera', camera: zoomCameraAt(session.camera, 1.45, point, viewport) });
                return;
              }
              if (selection.type === 'connection' && session.mode === 'edit') {
                // Edit mode extracts the tapped edge into its own deeper segment:
                // the current level collapses it to a summary line, the camera
                // steps into the new layer, and the sheet reopens on the edge.
                void (async () => {
                  const segmentId = await runMutation(() => runtime.extractConnection(selection.id), 'Sub-segment created from connection');
                  if (segmentId) stepIntoSegment(segmentId);
                  dispatch({ type: 'select', selection });
                })();
                return;
              }
              dispatch({ type: 'select', selection });
              const point = selectionFocusPoint(selection, projection);
              if (point) {
                const world = layoutService.screenToWorld(point, viewport, session.camera);
                dispatch({ type: 'set-camera', camera: focusCameraAboveSheet(session.camera, world, viewport, session.sheetHeight || 260) });
              }
            }}
            onMoveNode={handleMoveNode}
            onMoveRecord={handleMoveRecord}
            onPathHandleDrop={handlePathDrop}
            onPathHandleDrag={handlePathDrag}
            onBendDrop={handleBendDrop}
            onLongPress={(screenX, screenY) => {
              const world = layoutService.screenToWorld({ x: screenX, y: screenY }, viewport, session.camera);
              dispatch({ type: 'open-composer', point: {
                worldX: Math.max(8, Math.min(382, world.x)),
                depthRank: Math.max(1, Math.min(8, Math.round((ROAD_BOTTOM_Y - world.y) / ROAD_RANK_GAP))),
                segmentId: segmentIdAtPoint(screenX, screenY),
              } });
            }}
            onEdgeLongPress={handleEdgeLongPress}
            onTap={(x, y) => {
              // A blank tap also cancels a pending edge-start endpoint.
              if (session.edgeStartNodeId) dispatch({ type: 'set-edge-start' });
              gestures.onTap(x, y);
            }}
          />
          <MapControls
            mode={session.mode}
            onMode={(mode) => dispatch({ type: 'set-mode', mode })}
            onResetLayout={() => void runMutation(() => runtime.resetLayout(), 'Placements reset')}
          />
          <MapHint
            mode={session.mode}
            level={session.semanticLevel}
            scale={session.camera.scale}
            routeActive={routeActive}
          />
          {session.mode === 'edit' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Add Record" onPress={() => dispatch({ type: 'open-sheet', sheet: 'record' })} style={styles.capture}>
              <Text style={styles.captureText}>＋ Add Record</Text>
            </Pressable>
          )}
          {!!session.toast && <Pressable onPress={() => dispatch({ type: 'toast' })} style={styles.toast}><Text style={styles.toastText}>{session.toast}</Text></Pressable>}
        </View>
      </View>
      <MapBottomSheet
        session={session}
        projection={projection}
        options={options}
        segments={segments}
        onClose={() => dispatch({ type: 'close-sheet' })}
        onFindRoad={(from, to) => void handleFindRoad(from, to)}
        onQueryRoutes={handleQueryRoutes}
        onToggleFilter={(outcome) => dispatch({ type: 'toggle-filter', outcome })}
        onChangeOutcome={(id, outcome) => void runMutation(() => runtime.changeOutcome(id, outcome), 'Outcome updated')}
        onEditNode={(id, value) => void runMutation(() => runtime.editNode(id, value), 'Node updated')}
        onDelete={(type, id) => void runMutation(() => type === 'node' ? runtime.removeNode(id, true) : runtime.removeConnection(id), 'Removed safely')}
        onInsert={(id) => void runMutation(() => runtime.insertNode(id), 'Connection split with a new step')}
        onBend={(id, offsetX) => void runMutation(() => runtime.bendConnection(id, offsetX, 0), 'Edge curve moved')}
        onAddRecord={(targetId, summary) => void runMutation(async () => {
          await runtime.addRecord(targetId, summary);
          const detailScale = minScaleForSemanticLevel(4);
          if (session.camera.scale < detailScale) {
            dispatch({ type: 'set-camera', camera: { ...session.camera, scale: detailScale } });
          }
        }, 'Record attached')}
        onOpenRecord={() => dispatch({ type: 'open-sheet', sheet: 'record' })}
        onCreate={(value) => {
          const point = session.composerPoint;
          if (!point) return;
          if (point.connectionId) {
            void runMutation(() => runtime.insertNode(point.connectionId!, value), 'Connection split with a new step');
            return;
          }
          const { connectionId, ...placement } = point;
          void runMutation(async () => {
            await runtime.createNode({ ...value, ...placement });
            // A point dropped into a deep frame inherits that layer, which a
            // summary zoom would hide — center on it at a detail scale.
            const detailScale = minScaleForSemanticLevel(2);
            if (session.camera.scale < detailScale) {
              dispatch({ type: 'set-camera', camera: {
                centerX: placement.worldX,
                centerY: ROAD_BOTTOM_Y - placement.depthRank * ROAD_RANK_GAP,
                scale: detailScale,
              } });
            }
          }, 'Planned point added');
        }}
        onConnect={(from, to) => void runMutation(() => runtime.connect(from, to), 'Forward connection added')}
        onArmDelete={(id) => dispatch({ type: 'arm-delete', id })}
        onSheetHeight={(height) => dispatch({ type: 'set-sheet-height', height })}
        onComposerDraft={handleComposerDraft}
        onMoveNodeToSegment={(nodeId, segmentId) => void runMutation(() => runtime.moveNodeToSegment(nodeId, segmentId), 'Moved to a new layer')}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: mapTheme.paper },
  phoneColumn: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden', backgroundColor: mapTheme.paperStrong },
  mapArea: { flex: 1, minHeight: 360, overflow: 'hidden', backgroundColor: mapTheme.paper },
  center: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.paper },
  loading: { marginTop: 12, color: mapTheme.muted, fontSize: 11, fontWeight: '700' },
  errorTitle: { color: mapTheme.forestDark, fontFamily: 'Georgia', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  errorBody: { marginTop: 8, color: mapTheme.muted, fontSize: 11, textAlign: 'center' },
  retry: { minWidth: 120, minHeight: 46, marginTop: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.forest },
  retryText: { color: mapTheme.paperStrong, fontWeight: '800' },
  capture: { position: 'absolute', right: 12, bottom: 78, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.violet, shadowColor: mapTheme.shadow, shadowOpacity: 0.35, shadowRadius: 7 },
  captureText: { color: mapTheme.paperStrong, fontSize: 9, fontWeight: '900' },
  toast: { position: 'absolute', left: 42, right: 42, bottom: 80, minHeight: 42, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.forestDark },
  toastText: { color: mapTheme.paperStrong, fontSize: 9, fontWeight: '700', textAlign: 'center' },
});
