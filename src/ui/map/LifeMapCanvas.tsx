import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { PortraitMapProjection, ProjectedNode, ScreenPoint } from '../../application/map/projectionTypes';
import { Outcome } from '../../domain/lifeMap/entities';
import { BlockerBadge, FlowPath, HoldRing, MARKER_RADIUS, RoadArrowhead, SelectionRing, SparkPath } from './canvasDecorations';
import { closestConnectionId, quadraticPath, quadraticPointAt, quadraticSubpath } from './mapGeometry';
import { mapTheme, outcomeColor } from './mapTheme';
import { ComposerDraft, DraftPath, Selection, SessionMode } from './useLifeMapSession';

export interface ComposerPreview extends ComposerDraft {
  x: number;
  y: number;
  fromNodeId?: string;
  connectionId?: string;
}

interface LifeMapCanvasProps {
  projection: PortraitMapProjection;
  width: number;
  height: number;
  mode: SessionMode;
  gestureHandlers: object;
  selected?: Selection;
  routeActive: boolean;
  reducedMotion: boolean;
  draftPath?: DraftPath;
  composerPreview?: ComposerPreview;
  sparkConnectionIds: string[];
  onSelect: (selection: Selection) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onMoveRecord: (id: string, x: number, y: number) => void;
  onPathHandleDrop: (nodeId: string, x: number, y: number) => void;
  onPathHandleDrag: (nodeId: string, point?: ScreenPoint) => void;
  onBendDrop: (connectionId: string, x: number, y: number) => void;
  onLongPress: (x: number, y: number) => void;
  onEdgeLongPress: (connectionId: string) => void;
  onTap: (x: number, y: number) => void;
}

const stateDash = (outcome: Outcome): number[] | undefined =>
  outcome === 'todo' ? [8, 6] : outcome === 'failed' ? [3, 7] : undefined;

const markerGlyph = (node: Pick<ProjectedNode, 'kind' | 'permanent'>): string => {
  if (node.permanent) return '●';
  if (node.kind === 'goal') return '⚑';
  if (node.kind === 'status') return '◇';
  return '›';
};

/** The permanent origin keeps the smaller disc; other status nodes keep the wide pill. */
const markerRadius = (node: Pick<ProjectedNode, 'kind' | 'permanent'>): number =>
  node.permanent ? 19 : MARKER_RADIUS[node.kind] ?? 19;

const midpointControl = (from: ScreenPoint, to: ScreenPoint): ScreenPoint => ({
  x: (from.x + to.x) / 2 + (to.x - from.x) * 0.08,
  y: (from.y + to.y) / 2 - 36,
});

interface DraggableMarkerProps {
  node: ProjectedNode;
  mode: SessionMode;
  selected: boolean;
  dimmed: boolean;
  pathTarget: boolean;
  routeActive: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}

const DraggableMarker = ({ node, mode, selected, dimmed, pathTarget, routeActive, reducedMotion, onSelect, onMove }: DraggableMarkerProps) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const moved = useRef(false);
  const mount = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      mount.setValue(1);
      return;
    }
    Animated.timing(mount, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [mount, reducedMotion]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => mode === 'edit',
    onMoveShouldSetPanResponder: (_, gesture) => mode === 'edit' && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
    onPanResponderMove: (_, gesture) => {
      moved.current = true;
      setOffset({ x: gesture.dx, y: gesture.dy });
    },
    onPanResponderRelease: (_, gesture) => {
      if (moved.current) onMove(node.x + gesture.dx, node.y + gesture.dy);
      else onSelect();
      moved.current = false;
      setOffset({ x: 0, y: 0 });
    },
  }), [mode, node.x, node.y, onMove, onSelect]);
  const opacity = node.filtered ? 0.14 : routeActive && !node.onActiveRoute ? 0.18 : dimmed ? 0.35 : 1;
  const label = `${node.kind === 'status' ? 'Status' : node.kind}, ${node.title}, ${node.outcome}`;
  const style: StyleProp<ViewStyle> = [
    styles.nodeHit,
    { left: node.x - 24, top: node.y - 24, opacity, transform: [{ translateX: offset.x }, { translateY: offset.y }] },
  ];
  const content = (
    <Animated.View style={[styles.markerMount, { opacity: mount }]}>
      <View style={styles.markerWrap}>
        {selected && <SelectionRing radius={markerRadius(node)} reducedMotion={reducedMotion} />}
        {pathTarget && <SelectionRing radius={markerRadius(node)} reducedMotion color={mapTheme.forest} testID="path-target-ring" />}
        <View style={[
          styles.marker,
          node.kind === 'goal' && styles.goalMarker,
          node.kind === 'task' && styles.taskMarker,
          node.kind === 'status' && !node.permanent && styles.statusMarker,
          { borderColor: outcomeColor[node.outcome], backgroundColor: node.outcome === 'success' ? mapTheme.sagePale : node.outcome === 'failed' ? mapTheme.failedPale : mapTheme.paperStrong },
          selected && styles.selectedMarker,
        ]}>
          <Text style={[styles.markerGlyph, { color: outcomeColor[node.outcome] }]}>{markerGlyph(node)}</Text>
        </View>
      </View>
      {node.showLabel && (
        <Text numberOfLines={1} style={[styles.nodeLabel, routeActive && node.onActiveRoute && styles.routeNodeLabel]}>{node.title}</Text>
      )}
    </Animated.View>
  );
  // Pressability overrides responder handlers spread onto a Pressable, so the
  // edit-mode drag responder must live on a plain View to work at all.
  if (mode === 'edit') {
    return (
      <View {...responder.panHandlers} accessibilityRole="button" accessibilityLabel={label} style={style}>
        {content}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onSelect} style={style}>
      {content}
    </Pressable>
  );
};

const DragHandle = ({
  x,
  y,
  label,
  color,
  onDrop,
  onDragMove,
}: {
  x: number;
  y: number;
  label: string;
  color: string;
  onDrop: (x: number, y: number) => void;
  onDragMove?: (point?: ScreenPoint) => void;
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const latest = useRef({ x, y, onDrop, onDragMove });
  useEffect(() => {
    latest.current = { x, y, onDrop, onDragMove };
  }, [x, y, onDrop, onDragMove]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      setOffset({ x: gesture.dx, y: gesture.dy });
      const current = latest.current;
      current.onDragMove?.({ x: current.x + gesture.dx, y: current.y + gesture.dy });
    },
    onPanResponderRelease: (_, gesture) => {
      const current = latest.current;
      current.onDrop(current.x + gesture.dx, current.y + gesture.dy);
      current.onDragMove?.(undefined);
      setOffset({ x: 0, y: 0 });
    },
    onPanResponderTerminate: () => {
      latest.current.onDragMove?.(undefined);
      setOffset({ x: 0, y: 0 });
    },
  }), []);
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[styles.dragHandle, { left: x - 22, top: y - 22, borderColor: color, transform: [{ translateX: offset.x }, { translateY: offset.y }] }]}
    >
      <Text style={[styles.dragHandleText, { color }]}>＋</Text>
    </View>
  );
};

const DraggableRecord = ({
  id,
  summary,
  x,
  y,
  filtered,
  mode,
  routeActive,
  reducedMotion,
  onSelect,
  onMove,
}: {
  id: string;
  summary: string;
  x: number;
  y: number;
  filtered: boolean;
  mode: SessionMode;
  routeActive: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const moved = useRef(false);
  const mount = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      mount.setValue(1);
      return;
    }
    Animated.timing(mount, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [mount, reducedMotion]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => mode === 'edit',
    onMoveShouldSetPanResponder: () => mode === 'edit',
    onPanResponderMove: (_, gesture) => { moved.current = true; setOffset({ x: gesture.dx, y: gesture.dy }); },
    onPanResponderRelease: (_, gesture) => {
      if (moved.current) onMove(x + gesture.dx, y + gesture.dy);
      else onSelect();
      moved.current = false;
      setOffset({ x: 0, y: 0 });
    },
  }), [mode, onMove, onSelect, x, y]);
  const recordStyle: StyleProp<ViewStyle> = [styles.recordMarker, { left: x - 22, top: y - 22, opacity: filtered ? 0.12 : routeActive ? 0.1 : 1, transform: [{ translateX: offset.x }, { translateY: offset.y }] }];
  const recordContent = (
    <Animated.View style={[styles.markerMount, { opacity: mount }]}>
      <Text style={styles.recordGlyph}>▤</Text>
      <Text numberOfLines={1} style={styles.recordLabel}>{summary}</Text>
    </Animated.View>
  );
  // Same Pressability caveat as DraggableMarker: edit-mode drag needs a plain View.
  if (mode === 'edit') {
    return (
      <View {...responder.panHandlers} accessibilityRole="button" accessibilityLabel={`Record, ${summary}`} style={recordStyle}>
        {recordContent}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Record, ${summary}`} onPress={onSelect} style={recordStyle}>
      {recordContent}
    </Pressable>
  );
};

export const LifeMapCanvas = ({
  projection,
  width,
  height,
  mode,
  gestureHandlers,
  selected,
  routeActive,
  reducedMotion,
  draftPath,
  composerPreview,
  sparkConnectionIds,
  onSelect,
  onMoveNode,
  onMoveRecord,
  onPathHandleDrop,
  onPathHandleDrag,
  onBendDrop,
  onLongPress,
  onEdgeLongPress,
  onTap,
}: LifeMapCanvasProps) => {
  const [holdPoint, setHoldPoint] = useState<ScreenPoint | undefined>();

  const draftGeometry = useMemo(() => {
    if (!draftPath) return undefined;
    const source = projection.nodes.find((node) => node.id === draftPath.fromNodeId);
    if (!source) return undefined;
    const target = draftPath.targetNodeId ? projection.nodes.find((node) => node.id === draftPath.targetNodeId) : undefined;
    const rawEnd = target ?? { x: draftPath.x, y: draftPath.y };
    const direction = { x: rawEnd.x - source.x, y: rawEnd.y - source.y };
    const length = Math.hypot(direction.x, direction.y) || 1;
    const unit = { x: direction.x / length, y: direction.y / length };
    const from = { x: source.x + unit.x * markerRadius(source), y: source.y + unit.y * markerRadius(source) };
    const to = target
      ? { x: target.x - unit.x * markerRadius(target), y: target.y - unit.y * markerRadius(target) }
      : rawEnd;
    return { from, control: midpointControl(from, to), to };
  }, [projection, draftPath]);

  const composerRoads = useMemo(() => {
    if (!composerPreview) return [];
    const ghost = { x: composerPreview.x, y: composerPreview.y };
    if (composerPreview.connectionId) {
      const edge = projection.connections.find((connection) => connection.id === composerPreview.connectionId);
      if (!edge) return [];
      return [
        { key: 'in', from: edge.from, control: midpointControl(edge.from, ghost), to: ghost },
        { key: 'out', from: ghost, control: midpointControl(ghost, edge.to), to: edge.to },
      ];
    }
    if (composerPreview.fromNodeId) {
      const source = projection.nodes.find((node) => node.id === composerPreview.fromNodeId);
      if (!source) return [];
      return [{ key: 'in', from: source, control: midpointControl(source, ghost), to: ghost }];
    }
    return [];
  }, [projection, composerPreview]);

  return (
    <View style={[styles.canvas, { width, height }]} {...gestureHandlers}>
      <Pressable
        accessibilityLabel="Life Map canvas"
        delayLongPress={560}
        onPress={(event) => onTap(event.nativeEvent.locationX, event.nativeEvent.locationY)}
        onPressIn={(event) => {
          if (mode === 'edit') setHoldPoint({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
        }}
        onPressOut={() => setHoldPoint(undefined)}
        onLongPress={(event) => {
          setHoldPoint(undefined);
          if (mode !== 'edit') return;
          const x = event.nativeEvent.locationX;
          const y = event.nativeEvent.locationY;
          const edgeId = closestConnectionId({ x, y }, projection.connections, 14);
          if (edgeId) onEdgeLongPress(edgeId);
          else onLongPress(x, y);
        }}
        style={styles.canvasPressable}
      >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {projection.connections.map((connection) => {
          const muted = routeActive && !connection.onActiveRoute;
          const opacity = connection.filtered ? 0.1 : muted ? 0.11 : connection.onActiveRoute ? 1 : 0.78;
          return (
            <React.Fragment key={connection.id}>
              <Path
                testID={`connection-hit-${connection.id}`}
                d={quadraticPath(connection.from, connection.control, connection.to)}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                delayLongPress={560}
                onPress={() => onSelect({ type: 'connection', id: connection.id })}
                onLongPress={() => {
                  if (mode === 'edit') onEdgeLongPress(connection.id);
                }}
              />
              <Path
                d={quadraticPath(connection.from, connection.control, connection.to)}
                fill="none"
                stroke={outcomeColor[connection.outcome]}
                strokeDasharray={stateDash(connection.outcome)}
                strokeLinecap="round"
                strokeWidth={connection.onActiveRoute ? 5 : 2.6}
                opacity={opacity}
              />
              <RoadArrowhead
                testID={`arrowhead-${connection.id}`}
                from={connection.from}
                control={connection.control}
                to={connection.to}
                outcome={connection.outcome}
                opacity={opacity}
              />
              {connection.outcome === 'failed' && (
                <BlockerBadge
                  testID={`blocker-${connection.id}`}
                  point={quadraticPointAt(connection.from, connection.control, connection.to, 0.5)}
                  muted={connection.filtered || muted}
                />
              )}
              {sparkConnectionIds.includes(connection.id) && (
                <SparkPath
                  testID={`spark-${connection.id}`}
                  from={connection.from}
                  control={connection.control}
                  to={connection.to}
                  reducedMotion={reducedMotion}
                />
              )}
            </React.Fragment>
          );
        })}
        {projection.summaryConnections.map((connection) => {
          let cursor = 0;
          const total = Math.max(1, connection.sections.reduce((count, section) => count + section.connectionIds.length, 0));
          const muted = routeActive && !connection.onActiveRoute;
          const lastSection = connection.sections[connection.sections.length - 1];
          return (
            <React.Fragment key={connection.id}>
              <Path
                d={quadraticPath(connection.from, connection.control, connection.to)}
                fill="none"
                stroke="transparent"
                strokeWidth={22}
                onPress={() => onSelect({ type: 'summary', id: connection.id })}
              />
              {connection.sections.map((section, index) => {
                const start = cursor / total;
                cursor += section.connectionIds.length;
                const end = cursor / total;
                return <Path
                  key={`${connection.id}:${index}`}
                  d={quadraticSubpath(connection.from, connection.control, connection.to, start, end)}
                  fill="none"
                  stroke={outcomeColor[section.outcome]}
                  strokeDasharray={stateDash(section.outcome)}
                  strokeLinecap="round"
                  strokeWidth={5}
                  opacity={connection.filtered ? 0.12 : muted ? 0.11 : 0.92}
                />;
              })}
              {lastSection && (
                <RoadArrowhead
                  from={connection.from}
                  control={connection.control}
                  to={connection.to}
                  outcome={lastSection.outcome}
                  opacity={connection.filtered ? 0.12 : muted ? 0.11 : 0.92}
                />
              )}
              <SvgText x={connection.control.x} y={connection.control.y - 7} fill={mapTheme.forest} fontSize={9} fontWeight="700" textAnchor="middle" opacity={muted ? 0.11 : 1}>
                {connection.hiddenCount} hidden
              </SvgText>
            </React.Fragment>
          );
        })}
        {projection.recordAttachments.map((record) => (
          <Path
            key={`line:${record.id}`}
            d={`M ${record.from.x} ${record.from.y} L ${record.to.x} ${record.to.y}`}
            stroke={mapTheme.violet}
            strokeDasharray={[2, 4]}
            strokeWidth={1.5}
            opacity={record.filtered ? 0.1 : routeActive ? 0.1 : 0.7}
          />
        ))}
        {draftGeometry && (
          <>
            <FlowPath testID="draft-path" from={draftGeometry.from} control={draftGeometry.control} to={draftGeometry.to} color={mapTheme.gold} reducedMotion={reducedMotion} />
            <RoadArrowhead from={draftGeometry.from} control={draftGeometry.control} to={draftGeometry.to} outcome="todo" opacity={0.9} tipInset={draftPath?.targetNodeId ? 2 : 0} />
          </>
        )}
        {composerRoads.map((road) => (
          <FlowPath key={road.key} testID={`composer-spark-${road.key}`} from={road.from} control={road.control} to={road.to} color={mapTheme.forest} reducedMotion={reducedMotion} />
        ))}
      </Svg>
      {projection.nodes.map((node) => (
        <DraggableMarker
          key={node.id}
          node={node}
          mode={mode}
          selected={selected?.type === 'node' && selected.id === node.id}
          dimmed={composerPreview?.fromNodeId === node.id}
          pathTarget={draftPath?.targetNodeId === node.id}
          routeActive={routeActive}
          reducedMotion={reducedMotion}
          onSelect={() => onSelect({ type: 'node', id: node.id })}
          onMove={(x, y) => onMoveNode(node.id, x, y)}
        />
      ))}
      {projection.recordAttachments.map((record) => (
        <DraggableRecord
          key={record.id}
          id={record.id}
          summary={record.summary}
          x={record.from.x}
          y={record.from.y}
          filtered={record.filtered}
          mode={mode}
          routeActive={routeActive}
          reducedMotion={reducedMotion}
          onSelect={() => onSelect({ type: 'record', id: record.id })}
          onMove={(x, y) => onMoveRecord(record.id, x, y)}
        />
      ))}
      {composerPreview && (
        <View pointerEvents="none" testID="composer-ghost" style={[styles.ghost, { left: composerPreview.x - 24, top: composerPreview.y - 24 }]}>
          <View style={[
            styles.marker,
            composerPreview.kind === 'goal' && styles.goalMarker,
            composerPreview.kind === 'task' && styles.taskMarker,
            composerPreview.kind === 'status' && styles.statusMarker,
            styles.ghostMarker,
            { borderColor: outcomeColor[composerPreview.outcome] },
          ]}>
            <Text style={[styles.markerGlyph, { color: outcomeColor[composerPreview.outcome] }]}>{markerGlyph(composerPreview)}</Text>
          </View>
          <Text numberOfLines={1} style={styles.nodeLabel}>
            {composerPreview.title.trim() || `New ${composerPreview.kind}`}
          </Text>
        </View>
      )}
      {holdPoint && mode === 'edit' && <HoldRing testID="hold-ring" point={holdPoint} reducedMotion={reducedMotion} />}
      </Pressable>
      {/* Drag handles sit outside the canvas Pressable: Pressability claims the
          touch responder on press-in, which can swallow a child's pan gesture.
          box-none lets touches pass through to the map everywhere else. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {mode === 'edit' && selected?.type === 'node' && projection.nodes.filter((node) => node.id === selected.id && node.kind !== 'goal').map((node) => (
          <DragHandle
            key={`path-handle:${node.id}`}
            x={node.x + 28}
            y={node.y}
            label={`Drag to connect from ${node.title}`}
            color={mapTheme.gold}
            onDrop={(x, y) => onPathHandleDrop(node.id, x, y)}
            onDragMove={(point) => onPathHandleDrag(node.id, point)}
          />
        ))}
        {mode === 'edit' && selected?.type === 'connection' && projection.connections.filter((connection) => connection.id === selected.id).map((connection) => (
          <DragHandle
            key={`bend-handle:${connection.id}`}
            x={connection.control.x}
            y={connection.control.y}
            label="Drag to bend connection"
            color={mapTheme.violet}
            onDrop={(x, y) => onBendDrop(connection.id, x, y)}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { overflow: 'hidden', backgroundColor: mapTheme.paper },
  canvasPressable: { flex: 1 },
  nodeHit: { position: 'absolute', width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  markerMount: { alignItems: 'center' },
  markerWrap: { alignItems: 'center', justifyContent: 'center' },
  marker: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', shadowColor: mapTheme.shadow, shadowOpacity: 0.25, shadowRadius: 4 },
  goalMarker: { width: 40, height: 40, borderRadius: 20 },
  taskMarker: { borderRadius: 9 },
  statusMarker: { width: 40, height: 28, borderRadius: 14 },
  selectedMarker: { borderWidth: 4, shadowOpacity: 0.7, shadowRadius: 7 },
  markerGlyph: { fontSize: 17, fontWeight: '900' },
  nodeLabel: { position: 'absolute', top: 43, maxWidth: 112, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 7, overflow: 'hidden', color: mapTheme.ink, backgroundColor: 'rgba(255,253,248,0.9)', fontSize: 9, fontWeight: '700' },
  routeNodeLabel: { color: mapTheme.forestDark, backgroundColor: mapTheme.goldPale },
  ghost: { position: 'absolute', width: 48, alignItems: 'center', opacity: 0.8, zIndex: 6 },
  ghostMarker: { backgroundColor: 'transparent', borderStyle: 'dashed', shadowOpacity: 0 },
  recordMarker: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  recordGlyph: { width: 25, height: 25, borderRadius: 7, overflow: 'hidden', color: mapTheme.violet, backgroundColor: mapTheme.violetPale, textAlign: 'center', lineHeight: 25, fontSize: 13, fontWeight: '900' },
  recordLabel: { position: 'absolute', top: 35, width: 72, color: mapTheme.violet, textAlign: 'center', fontSize: 8, fontWeight: '700' },
  dragHandle: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.paperStrong, zIndex: 12 },
  dragHandleText: { fontSize: 17, fontWeight: '900' },
});
