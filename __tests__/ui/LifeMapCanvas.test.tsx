import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { PortraitMapProjection, ProjectedConnection, ProjectedNode } from '../../src/application/map/projectionTypes';
import { Outcome } from '../../src/domain/lifeMap/entities';
import { ComposerPreview, LifeMapCanvas } from '../../src/ui/map/LifeMapCanvas';
import { mapTheme } from '../../src/ui/map/mapTheme';

const node = (id: string, overrides: Partial<ProjectedNode> = {}): ProjectedNode => ({
  id, title: `Title ${id}`, description: '', kind: 'task', outcome: 'todo',
  x: 100, y: 300, worldX: 100, worldY: 300, depthRank: 1,
  showLabel: true, filtered: false, onActiveRoute: false, ...overrides,
});

const connection = (id: string, fromNodeId: string, toNodeId: string, overrides: Partial<ProjectedConnection> = {}): ProjectedConnection => ({
  id, fromNodeId, toNodeId, meaning: 'connects', outcome: 'success',
  from: { x: 100, y: 300 }, control: { x: 150, y: 200 }, to: { x: 200, y: 100 },
  filtered: false, onActiveRoute: false, ...overrides,
});

const projectionFor = (nodes: ProjectedNode[], connections: ProjectedConnection[]): PortraitMapProjection => ({
  nodes,
  connections,
  summaryConnections: [],
  segmentOverlays: [],
  recordAttachments: [],
  headerSummary: { title: '', detail: '', activeRoute: false },
  diagnostics: { semanticLevel: 4, visibleNodeIds: [], hiddenNodeIds: [], optionalLabelNodeIds: [], summaryCount: 0, worldCenter: { x: 0, y: 0 } },
});

const renderCanvas = (overrides: Partial<Parameters<typeof LifeMapCanvas>[0]> = {}) => {
  const props: Parameters<typeof LifeMapCanvas>[0] = {
    projection: projectionFor(
      [node('a', { outcome: 'success' }), node('b', { x: 200, y: 100, depthRank: 2 })],
      [connection('c1', 'a', 'b')],
    ),
    width: 390,
    height: 700,
    mode: 'visual',
    gestureHandlers: {},
    routeActive: false,
    reducedMotion: true,
    sparkConnectionIds: [],
    onSelect: jest.fn(),
    onMoveNode: jest.fn(),
    onMoveRecord: jest.fn(),
    onPathHandleDrop: jest.fn(),
    onPathHandleDrag: jest.fn(),
    onBendDrop: jest.fn(),
    onLongPress: jest.fn(),
    onEdgeLongPress: jest.fn(),
    ...overrides,
  };
  const screen = render(<LifeMapCanvas {...props} />);
  return { screen, props };
};

describe('LifeMapCanvas visual states', () => {
  it('draws a blocker badge at the midpoint of failed roads only', () => {
    const failed = connection('c2', 'a', 'b', { outcome: 'failed' });
    const { screen } = renderCanvas({
      projection: projectionFor([node('a'), node('b')], [connection('c1', 'a', 'b'), failed]),
    });
    expect(screen.queryByTestId('blocker-c1')).toBeNull();
    expect(screen.getByTestId('blocker-c2')).toBeTruthy();
  });

  it('draws an arrowhead for every road, muted off the active route', () => {
    const onRoute = connection('c1', 'a', 'b', { onActiveRoute: true });
    const offRoute = connection('c2', 'a', 'b');
    const { screen } = renderCanvas({
      routeActive: true,
      projection: projectionFor([node('a'), node('b')], [onRoute, offRoute]),
    });
    expect(screen.getByTestId('arrowhead-c1').props.opacity).toBe(1);
    expect(screen.getByTestId('arrowhead-c2').props.opacity).toBe(0.11);
  });

  it('mutes non-route markers and emphasizes route labels', () => {
    const onRoute = connection('c1', 'a', 'b', { onActiveRoute: true });
    const { screen } = renderCanvas({
      routeActive: true,
      projection: projectionFor(
        [node('a', { onActiveRoute: true }), node('b', { x: 200, y: 100 })],
        [onRoute],
      ),
    });
    const mutedMarker = screen.getByLabelText('task, Title b, todo');
    expect(StyleSheet.flatten(mutedMarker.props.style).opacity).toBe(0.18);
    const routeLabel = screen.getByText('Title a');
    expect(StyleSheet.flatten(routeLabel.props.style).backgroundColor).toBe(mapTheme.goldPale);
  });
});

describe('LifeMapCanvas edit feedback', () => {
  it('shows a hold ring at the press point in edit mode only', () => {
    const { screen } = renderCanvas({ mode: 'edit' });
    const canvas = screen.getByLabelText('Life Map canvas');
    fireEvent(canvas, 'pressIn', { nativeEvent: { locationX: 60, locationY: 80 } });
    expect(screen.getByTestId('hold-ring')).toBeTruthy();
    fireEvent(canvas, 'pressOut', { nativeEvent: {} });
    expect(screen.queryByTestId('hold-ring')).toBeNull();
  });

  it('does not show a hold ring in visual mode', () => {
    const { screen } = renderCanvas({ mode: 'visual' });
    fireEvent(screen.getByLabelText('Life Map canvas'), 'pressIn', { nativeEvent: { locationX: 60, locationY: 80 } });
    expect(screen.queryByTestId('hold-ring')).toBeNull();
  });

  it('routes blank long-press to blank creation and edge long-press to insertion', () => {
    const { screen, props } = renderCanvas({ mode: 'edit' });
    const canvas = screen.getByLabelText('Life Map canvas');
    // The stub connection's curve midpoint is (150, 200).
    fireEvent(canvas, 'longPress', { nativeEvent: { locationX: 151, locationY: 198 } });
    expect(props.onEdgeLongPress).toHaveBeenCalledWith('c1');
    fireEvent(canvas, 'longPress', { nativeEvent: { locationX: 30, locationY: 380 } });
    expect(props.onLongPress).toHaveBeenCalledWith(30, 380);
  });

  it('renders a draft path preview and highlights the snap target', () => {
    const { screen } = renderCanvas({
      mode: 'edit',
      draftPath: { fromNodeId: 'a', x: 150, y: 220, targetNodeId: 'b' },
    });
    expect(screen.getByTestId('draft-path')).toBeTruthy();
    expect(screen.getByTestId('path-target-ring')).toBeTruthy();
  });

  it('renders a composer ghost with a spark road from the source node', () => {
    const composerPreview: ComposerPreview = {
      x: 150, y: 220, title: 'Typed title', kind: 'task', outcome: 'todo', fromNodeId: 'a',
    };
    const { screen } = renderCanvas({ mode: 'edit', composerPreview });
    expect(screen.getByTestId('composer-ghost')).toBeTruthy();
    expect(screen.getByText('Typed title')).toBeTruthy();
    expect(screen.getByTestId('composer-spark-in')).toBeTruthy();
  });
});
