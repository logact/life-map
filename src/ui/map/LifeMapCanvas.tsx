import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { PortraitMapProjection, ProjectedNode } from '../../application/map/projectionTypes';
import { Outcome } from '../../domain/lifeMap/entities';
import { Selection, SessionMode } from './useLifeMapSession';
import { mapTheme, outcomeColor } from './mapTheme';
import { quadraticPath, quadraticSubpath } from './mapGeometry';

interface LifeMapCanvasProps {
  projection: PortraitMapProjection;
  width: number;
  height: number;
  mode: SessionMode;
  gestureHandlers: object;
  selected?: Selection;
  onSelect: (selection: Selection) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onMoveRecord: (id: string, x: number, y: number) => void;
  onPathHandleDrop: (nodeId: string, x: number, y: number) => void;
  onBendDrop: (connectionId: string, x: number, y: number) => void;
  onLongPress: (x: number, y: number) => void;
}

const stateDash = (outcome: Outcome): number[] | undefined =>
  outcome === 'todo' ? [8, 6] : outcome === 'failed' ? [3, 7] : undefined;

const markerGlyph = (node: ProjectedNode): string => {
  if (node.kind === 'originStatus') return '●';
  if (node.kind === 'goal') return '⚑';
  if (node.kind === 'checkpoint') return '◇';
  return '›';
};

interface DraggableMarkerProps {
  node: ProjectedNode;
  mode: SessionMode;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}

const DraggableMarker = ({ node, mode, selected, onSelect, onMove }: DraggableMarkerProps) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const moved = useRef(false);
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
  return (
    <Pressable
      {...(mode === 'edit' ? responder.panHandlers : {})}
      accessibilityRole="button"
      accessibilityLabel={`${node.kind === 'checkpoint' ? 'Status checkpoint' : node.kind}, ${node.title}, ${node.outcome}`}
      onPress={mode === 'visual' ? onSelect : undefined}
      style={[
        styles.nodeHit,
        { left: node.x - 24, top: node.y - 24, opacity: node.filtered ? 0.14 : 1, transform: [{ translateX: offset.x }, { translateY: offset.y }] },
      ]}
    >
      <View style={[
        styles.marker,
        node.kind === 'goal' && styles.goalMarker,
        node.kind === 'task' && styles.taskMarker,
        node.kind === 'checkpoint' && styles.checkpointMarker,
        { borderColor: outcomeColor[node.outcome], backgroundColor: node.outcome === 'success' ? mapTheme.sagePale : node.outcome === 'failed' ? mapTheme.failedPale : mapTheme.paperStrong },
        selected && styles.selectedMarker,
      ]}>
        <Text style={[styles.markerGlyph, { color: outcomeColor[node.outcome] }]}>{markerGlyph(node)}</Text>
      </View>
      {node.showLabel && <Text numberOfLines={1} style={styles.nodeLabel}>{node.title}</Text>}
    </Pressable>
  );
};

const DragHandle = ({
  x,
  y,
  label,
  color,
  onDrop,
}: {
  x: number;
  y: number;
  label: string;
  color: string;
  onDrop: (x: number, y: number) => void;
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => setOffset({ x: gesture.dx, y: gesture.dy }),
    onPanResponderRelease: (_, gesture) => {
      onDrop(x + gesture.dx, y + gesture.dy);
      setOffset({ x: 0, y: 0 });
    },
  }), [onDrop, x, y]);
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
  onSelect,
  onMove,
}: {
  id: string;
  summary: string;
  x: number;
  y: number;
  filtered: boolean;
  mode: SessionMode;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const moved = useRef(false);
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
  return (
    <Pressable
      {...(mode === 'edit' ? responder.panHandlers : {})}
      accessibilityRole="button"
      accessibilityLabel={`Record, ${summary}`}
      onPress={mode === 'visual' ? onSelect : undefined}
      style={[styles.recordMarker, { left: x - 22, top: y - 22, opacity: filtered ? 0.12 : 1, transform: [{ translateX: offset.x }, { translateY: offset.y }] }]}
    >
      <Text style={styles.recordGlyph}>▤</Text>
      <Text numberOfLines={1} style={styles.recordLabel}>{summary}</Text>
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
  onSelect,
  onMoveNode,
  onMoveRecord,
  onPathHandleDrop,
  onBendDrop,
  onLongPress,
}: LifeMapCanvasProps) => (
  <Pressable
    accessibilityLabel="Life Map canvas"
    delayLongPress={520}
    onLongPress={(event) => mode === 'edit' && onLongPress(event.nativeEvent.locationX, event.nativeEvent.locationY)}
    style={[styles.canvas, { width, height }]}
    {...gestureHandlers}
  >
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {projection.segmentOverlays.map((overlay) => (
        <Rect
          key={overlay.id}
          x={overlay.bounds.x}
          y={overlay.bounds.y}
          width={overlay.bounds.width}
          height={overlay.bounds.height}
          rx={24}
          fill="none"
          stroke={overlay.tone === 'distance' ? mapTheme.gold : overlay.tone === 'readiness' ? mapTheme.violet : mapTheme.sage}
          strokeOpacity={selected?.type === 'segment' && selected.id === overlay.id ? 0.55 : 0.2}
          strokeWidth={selected?.type === 'segment' && selected.id === overlay.id ? 10 : 7}
          onPress={() => onSelect({ type: 'segment', id: overlay.id })}
        />
      ))}
      {projection.connections.map((connection) => (
        <React.Fragment key={connection.id}>
          <Path
            d={quadraticPath(connection.from, connection.control, connection.to)}
            fill="none"
            stroke="transparent"
            strokeWidth={18}
            onPress={() => onSelect({ type: 'connection', id: connection.id })}
          />
          <Path
            d={quadraticPath(connection.from, connection.control, connection.to)}
            fill="none"
            stroke={outcomeColor[connection.outcome]}
            strokeDasharray={stateDash(connection.outcome)}
            strokeLinecap="round"
            strokeWidth={connection.onActiveRoute ? 5 : 2.6}
            opacity={connection.filtered ? 0.1 : connection.onActiveRoute ? 1 : 0.78}
          />
          <Circle cx={connection.to.x} cy={connection.to.y} r={2.2} fill={outcomeColor[connection.outcome]} />
        </React.Fragment>
      ))}
      {projection.summaryConnections.map((connection) => {
        let cursor = 0;
        const total = Math.max(1, connection.sections.reduce((count, section) => count + section.connectionIds.length, 0));
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
                opacity={connection.filtered ? 0.12 : 0.92}
              />;
            })}
            <SvgText x={connection.control.x} y={connection.control.y - 7} fill={mapTheme.forest} fontSize={9} fontWeight="700" textAnchor="middle">
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
          opacity={record.filtered ? 0.1 : 0.7}
        />
      ))}
    </Svg>
    {projection.nodes.map((node) => (
      <DraggableMarker
        key={node.id}
        node={node}
        mode={mode}
        selected={selected?.type === 'node' && selected.id === node.id}
        onSelect={() => onSelect({ type: 'node', id: node.id })}
        onMove={(x, y) => onMoveNode(node.id, x, y)}
      />
    ))}
    {mode === 'edit' && selected?.type === 'node' && projection.nodes.filter((node) => node.id === selected.id && node.kind !== 'goal').map((node) => (
      <DragHandle
        key={`path-handle:${node.id}`}
        x={node.x + 28}
        y={node.y}
        label={`Drag to connect from ${node.title}`}
        color={mapTheme.gold}
        onDrop={(x, y) => onPathHandleDrop(node.id, x, y)}
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
    {projection.recordAttachments.map((record) => (
      <DraggableRecord
        key={record.id}
        id={record.id}
        summary={record.summary}
        x={record.from.x}
        y={record.from.y}
        filtered={record.filtered}
        mode={mode}
        onSelect={() => onSelect({ type: 'record', id: record.id })}
        onMove={(x, y) => onMoveRecord(record.id, x, y)}
      />
    ))}
  </Pressable>
);

const styles = StyleSheet.create({
  canvas: { overflow: 'hidden', backgroundColor: mapTheme.paper },
  nodeHit: { position: 'absolute', width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  marker: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', shadowColor: mapTheme.shadow, shadowOpacity: 0.25, shadowRadius: 4 },
  goalMarker: { width: 40, height: 40, borderRadius: 20 },
  taskMarker: { borderRadius: 9 },
  checkpointMarker: { width: 40, height: 28, borderRadius: 14 },
  selectedMarker: { borderWidth: 4, shadowOpacity: 0.7, shadowRadius: 7 },
  markerGlyph: { fontSize: 17, fontWeight: '900' },
  nodeLabel: { position: 'absolute', top: 43, maxWidth: 112, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 7, overflow: 'hidden', color: mapTheme.ink, backgroundColor: 'rgba(255,253,248,0.9)', fontSize: 9, fontWeight: '700' },
  recordMarker: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  recordGlyph: { width: 25, height: 25, borderRadius: 7, overflow: 'hidden', color: mapTheme.violet, backgroundColor: mapTheme.violetPale, textAlign: 'center', lineHeight: 25, fontSize: 13, fontWeight: '900' },
  recordLabel: { position: 'absolute', top: 35, width: 72, color: mapTheme.violet, textAlign: 'center', fontSize: 8, fontWeight: '700' },
  dragHandle: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.paperStrong, zIndex: 12 },
  dragHandleText: { fontSize: 17, fontWeight: '900' },
});
