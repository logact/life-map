import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PortraitMapProjection } from '../../application/map/projectionTypes';
import { ROAD_BOTTOM_Y, ROAD_RANK_GAP, RoadLayoutService } from '../../application/map/RoadLayoutService';
import { fitCameraToBounds, zoomCameraAt } from '../../application/map/camera';
import { LifeMapError } from '../../domain/lifeMap/LifeMapErrors';
import { useLifeMapRuntime } from '../composition/LifeMapProvider';
import { RuntimeNodeOption } from '../composition/createLifeMapRuntime';
import { LifeMapCanvas } from './LifeMapCanvas';
import { MapBottomSheet } from './MapBottomSheet';
import { MapControls } from './MapControls';
import { MapHeader } from './MapHeader';
import { mapTheme } from './mapTheme';
import { useLifeMapSession } from './useLifeMapSession';
import { useMapGestures } from './useMapGestures';

export const LifeMapScreen = () => {
  const runtime = useLifeMapRuntime();
  const [session, dispatch] = useLifeMapSession();
  const window = useWindowDimensions();
  const [mapSize, setMapSize] = useState({ width: Math.min(window.width, 520), height: Math.max(420, window.height - 120) });
  const [projection, setProjection] = useState<PortraitMapProjection>();
  const previousProjection = useRef<PortraitMapProjection | undefined>(undefined);
  const [options, setOptions] = useState<RuntimeNodeOption[]>([]);
  const [error, setError] = useState<string>();
  const layoutService = useRef(new RoadLayoutService()).current;
  const viewport = { width: mapSize.width, height: mapSize.height };

  const load = useCallback(async () => {
    try {
      const next = await runtime.load({
        viewport,
        camera: session.camera,
        semanticLevel: session.semanticLevel,
        focus: session.selection && session.selection.type !== 'summary'
          ? { type: session.selection.type, id: session.selection.id }
          : undefined,
        outcomeFilters: session.filters,
        activeRoute: session.activeRoute,
        previousProjection: previousProjection.current,
      });
      previousProjection.current = next;
      setProjection(next);
      setOptions(await runtime.options());
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [runtime, mapSize.width, mapSize.height, session.camera, session.semanticLevel, session.selection, session.filters, session.activeRoute]);

  useEffect(() => { void load(); }, [load]);

  const runMutation = async (operation: () => Promise<unknown>, success?: string) => {
    try {
      await operation();
      dispatch({ type: 'close-sheet' });
      if (success) dispatch({ type: 'toast', message: success });
      await load();
    } catch (caught) {
      const message = caught instanceof LifeMapError ? caught.message : caught instanceof Error ? caught.message : String(caught);
      dispatch({ type: 'toast', message });
    }
  };

  const gestureHandlers = useMapGestures({
    camera: session.camera,
    viewport,
    enabled: session.mode === 'visual' && !session.sheet,
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

  const handlePathDrop = (nodeId: string, screenX: number, screenY: number) => {
    const source = projection.nodes.find((node) => node.id === nodeId);
    if (!source || source.depthRank >= 8) {
      dispatch({ type: 'toast', message: 'A destination at the top has no forward depth available.' });
      return;
    }
    const nearest = projection.nodes
      .filter((node) => node.id !== nodeId && node.depthRank > source.depthRank)
      .map((node) => ({ node, distance: Math.hypot(node.x - screenX, node.y - screenY) }))
      .sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id))[0];
    if (nearest && nearest.distance <= 66) {
      void runMutation(() => runtime.connect(nodeId, nearest.node.id), `Connected to ${nearest.node.title}`);
      return;
    }
    const world = layoutService.screenToWorld({ x: screenX, y: screenY }, viewport, session.camera);
    dispatch({ type: 'open-composer', point: {
      worldX: Math.max(8, Math.min(382, world.x)),
      depthRank: Math.max(source.depthRank + 1, Math.min(8, Math.round((ROAD_BOTTOM_Y - world.y) / ROAD_RANK_GAP))),
      fromNodeId: nodeId,
    } });
  };

  const handleBendDrop = (connectionId: string, screenX: number, screenY: number) => {
    const connection = projection.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) return;
    const midpoint = { x: (connection.from.x + connection.to.x) / 2, y: (connection.from.y + connection.to.y) / 2 };
    void runMutation(
      () => runtime.bendConnection(connectionId, (screenX - midpoint.x) / session.camera.scale, (screenY - midpoint.y) / session.camera.scale),
      'Curve updated',
    );
  };

  const handleFindRoad = async (fromNodeId: string, toNodeId: string) => {
    const result = await runtime.findRoad(fromNodeId, toNodeId);
    if (result.status === 'unreachable') {
      dispatch({ type: 'toast', message: 'No forward road reaches that destination yet.' });
      return;
    }
    dispatch({ type: 'show-route', route: result });
    dispatch({ type: 'set-camera', camera: fitCameraToBounds(result.bounds, viewport, 80) });
  };

  if (!projection && !error) {
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={styles.center}><ActivityIndicator color={mapTheme.forest} /><Text style={styles.loading}>Preparing your roads…</Text></View></SafeAreaView>;
  }
  if (error && !projection) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.errorTitle}>The map could not be loaded</Text><Text style={styles.errorBody}>{error}</Text><Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View></SafeAreaView>;
  }
  if (!projection) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.phoneColumn}>
        <MapHeader
          summary={projection.headerSummary}
          onRoute={() => dispatch({ type: 'open-sheet', sheet: 'route' })}
          onReset={() => dispatch({ type: 'reset-camera' })}
          onLegend={() => dispatch({ type: 'open-sheet', sheet: 'legend' })}
          onClearRoute={() => dispatch({ type: 'clear-route' })}
        />
        <View style={styles.mapArea} onLayout={onMapLayout}>
          <LifeMapCanvas
            projection={projection}
            width={mapSize.width}
            height={mapSize.height}
            mode={session.mode}
            gestureHandlers={gestureHandlers}
            selected={session.selection}
            onSelect={(selection) => {
              if (selection.type === 'summary') dispatch({ type: 'set-level', level: session.semanticLevel + 1 });
              dispatch({ type: 'select', selection });
            }}
            onMoveNode={handleMoveNode}
            onMoveRecord={handleMoveRecord}
            onPathHandleDrop={handlePathDrop}
            onBendDrop={handleBendDrop}
            onLongPress={(screenX, screenY) => {
              const world = layoutService.screenToWorld({ x: screenX, y: screenY }, viewport, session.camera);
              dispatch({ type: 'open-composer', point: {
                worldX: Math.max(8, Math.min(382, world.x)),
                depthRank: Math.max(1, Math.min(8, Math.round((ROAD_BOTTOM_Y - world.y) / ROAD_RANK_GAP))),
                segmentId: session.selection?.type === 'segment' ? session.selection.id : undefined,
              } });
            }}
          />
          <MapControls
            mode={session.mode}
            level={session.semanticLevel}
            onMode={(mode) => dispatch({ type: 'set-mode', mode })}
            onLevel={(level) => dispatch({ type: 'set-level', level })}
            onCameraZoom={(factor) => dispatch({ type: 'set-camera', camera: zoomCameraAt(session.camera, factor, { x: viewport.width / 2, y: viewport.height / 2 }, viewport) })}
            onResetLayout={() => void runMutation(() => runtime.resetLayout(), 'Placements reset')}
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
        onClose={() => dispatch({ type: 'close-sheet' })}
        onFindRoad={(from, to) => void handleFindRoad(from, to)}
        onToggleFilter={(outcome) => dispatch({ type: 'toggle-filter', outcome })}
        onChangeOutcome={(id, outcome) => void runMutation(() => runtime.changeOutcome(id, outcome), 'Outcome updated')}
        onEditNode={(id, value) => void runMutation(() => runtime.editNode(id, value), 'Node updated')}
        onDelete={(type, id) => void runMutation(() => type === 'node' ? runtime.removeNode(id, true) : runtime.removeConnection(id), 'Removed safely')}
        onInsert={(id) => void runMutation(() => runtime.insertNode(id), 'Connection split with a new step')}
        onBend={(id, offsetX) => void runMutation(() => runtime.bendConnection(id, offsetX, 0), 'Curve updated')}
        onAddRecord={(targetId, summary) => void runMutation(async () => {
          await runtime.addRecord(targetId, summary);
          dispatch({ type: 'set-level', level: 4 });
        }, 'Record attached')}
        onOpenRecord={() => dispatch({ type: 'open-sheet', sheet: 'record' })}
        onCreate={(value) => {
          const point = session.composerPoint;
          if (!point) return;
          void runMutation(() => runtime.createNode({ ...value, ...point }), 'Planned point added');
        }}
        onConnect={(from, to) => void runMutation(() => runtime.connect(from, to), 'Forward connection added')}
        onArmDelete={(id) => dispatch({ type: 'arm-delete', id })}
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
