import React from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PortraitMapProjection } from '../../src/application/map/projectionTypes';
import { RoadPreview } from '../../src/application/map/FindRoadService';
import { RuntimeNodeOption, RuntimeSegmentOption } from '../../src/ui/composition/createLifeMapRuntime';
import { MapBottomSheet } from '../../src/ui/map/MapBottomSheet';
import { LifeMapSessionState, initialLifeMapSession } from '../../src/ui/map/useLifeMapSession';

const projection: PortraitMapProjection = {
  nodes: [{
    id: 'n1', title: 'Weekly dinner', description: 'One unhurried meal.', kind: 'task', outcome: 'failed',
    x: 100, y: 200, worldX: 100, worldY: 500, depthRank: 2, showLabel: true, filtered: false, onActiveRoute: false,
  }],
  connections: [],
  summaryConnections: [],
  segmentOverlays: [],
  recordAttachments: [],
  headerSummary: { title: '', detail: '', activeRoute: false },
  diagnostics: { semanticLevel: 2, visibleNodeIds: ['n1'], hiddenNodeIds: [], optionalLabelNodeIds: [], summaryCount: 0, worldCenter: { x: 0, y: 0 } },
};

const options: RuntimeNodeOption[] = [
  { id: 'start', title: 'Started here', kind: 'status', depthRank: 0, outcome: 'success' },
  { id: 'marathon', title: 'Finish a marathon', kind: 'goal', depthRank: 8, outcome: 'todo' },
  { id: 'kyoto', title: 'Live in Kyoto', kind: 'goal', depthRank: 8, outcome: 'todo' },
];

const baseProps = (session: LifeMapSessionState, overrides: Record<string, unknown> = {}) => ({
  session,
  projection,
  options: [] as RuntimeNodeOption[],
  onClose: jest.fn(),
  onFindRoad: jest.fn(),
  onQueryRoutes: jest.fn((_from: string) => Promise.resolve([] as RoadPreview[])),
  onToggleFilter: jest.fn(),
  onChangeOutcome: jest.fn(),
  onEditNode: jest.fn(),
  onDelete: jest.fn(),
  onInsert: jest.fn(),
  onBend: jest.fn(),
  onAddRecord: jest.fn(),
  onOpenRecord: jest.fn(),
  onCreate: jest.fn(),
  onConnect: jest.fn(),
  onArmDelete: jest.fn(),
  onSheetHeight: jest.fn(),
  onComposerDraft: jest.fn(),
  onMoveNodeToSegment: jest.fn(),
  segments: [] as RuntimeSegmentOption[],
  ...overrides,
});

describe('MapBottomSheet', () => {
  it('lifts the sheet above the keyboard so inputs stay visible', () => {
    const session: LifeMapSessionState = { ...initialLifeMapSession, sheet: 'legend' };
    const screen = render(<MapBottomSheet {...baseProps(session)} />);
    // Jest runs as iOS, where the window does not resize for the keyboard.
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });

  it('arms destructive actions with a second-tap confirmation', () => {
    const session: LifeMapSessionState = {
      ...initialLifeMapSession,
      mode: 'edit',
      sheet: 'detail',
      selection: { type: 'node', id: 'n1' },
    };
    const props = baseProps(session);
    const screen = render(<MapBottomSheet {...props} />);
    fireEvent.press(screen.getByText('Delete / archive'));
    expect(props.onArmDelete).toHaveBeenCalledWith('n1');
    expect(props.onDelete).not.toHaveBeenCalled();

    screen.rerender(<MapBottomSheet {...props} session={{ ...session, deleteArmedId: 'n1' }} />);
    fireEvent.press(screen.getByText('Tap again to confirm'));
    expect(props.onDelete).toHaveBeenCalledWith('node', 'n1');
  });

  it('offers edge insertion from the connection detail sheet in Edit mode', () => {
    const withConnection: PortraitMapProjection = {
      ...projection,
      connections: [{
        id: 'c1', fromNodeId: 'n1', toNodeId: 'n2', meaning: 'becomes', outcome: 'todo',
        from: { x: 0, y: 100 }, control: { x: 50, y: 50 }, to: { x: 100, y: 0 },
        filtered: false, onActiveRoute: false,
      }],
    };
    const session: LifeMapSessionState = {
      ...initialLifeMapSession,
      mode: 'edit',
      sheet: 'detail',
      selection: { type: 'connection', id: 'c1' },
    };
    const props = baseProps(session, { projection: withConnection });
    const screen = render(<MapBottomSheet {...props} />);
    fireEvent.press(screen.getByText('Insert a node into this connection'));
    expect(props.onInsert).toHaveBeenCalledWith('c1');
    // Edge extraction moved to tapping the edge itself, so the sheet offers no button.
    expect(screen.queryByText('Create sub-segment from this connection')).toBeNull();
  });

  it('offers the road layers as move targets for a selected node in Edit mode', () => {
    const session: LifeMapSessionState = {
      ...initialLifeMapSession,
      mode: 'edit',
      sheet: 'detail',
      selection: { type: 'node', id: 'n1' },
    };
    const segments: RuntimeSegmentOption[] = [
      { id: 'root', title: 'Journey', depth: 0 },
      { id: 's1', title: 'Weekly base', depth: 1 },
    ];
    const props = baseProps(session, { segments });
    const screen = render(<MapBottomSheet {...props} />);
    expect(screen.getByText('Move to layer')).toBeTruthy();
    expect(screen.getByText('L1')).toBeTruthy();
    fireEvent.press(screen.getByText('Weekly base'));
    expect(props.onMoveNodeToSegment).toHaveBeenCalledWith('n1', 's1');

    screen.rerender(<MapBottomSheet {...props} session={{ ...session, mode: 'visual' }} />);
    expect(screen.queryByText('Move to layer')).toBeNull();
  });
});

describe('MapBottomSheet route search', () => {
  const routeSession: LifeMapSessionState = { ...initialLifeMapSession, sheet: 'route' };

  it('queries live route previews for every matching destination', async () => {
    const onQueryRoutes = jest.fn((_from: string) => Promise.resolve<RoadPreview[]>([
      { toNodeId: 'marathon', connectionCount: 4, failedEndpointCount: 1 },
    ]));
    const props = baseProps(routeSession, { options, onQueryRoutes });
    const screen = render(<MapBottomSheet {...props} />);
    expect(onQueryRoutes).toHaveBeenCalledWith('start');
    expect(await screen.findByText('4 connections from Started here')).toBeTruthy();
    expect(screen.getByText('No road from Started here yet')).toBeTruthy();
  });

  it('picks a start point from the start input before finding a road', async () => {
    const onQueryRoutes = jest.fn((_from: string) => Promise.resolve<RoadPreview[]>([]));
    const props = baseProps(routeSession, { options, onQueryRoutes });
    const screen = render(<MapBottomSheet {...props} />);
    fireEvent.changeText(screen.getByLabelText('Search start point'), 'marathon');
    fireEvent.press(screen.getByLabelText('Start from Finish a marathon'));
    await waitFor(() => expect(onQueryRoutes).toHaveBeenCalledWith('marathon'));
    fireEvent.press(screen.getByLabelText('Find road to Live in Kyoto'));
    expect(props.onFindRoad).toHaveBeenCalledWith('marathon', 'kyoto');
  });

  it('shows an empty state when no destination matches the query', async () => {
    const props = baseProps(routeSession, { options });
    const screen = render(<MapBottomSheet {...props} />);
    fireEvent.changeText(screen.getByLabelText('Search destination'), 'zzz');
    expect(await screen.findByText('No matching destination')).toBeTruthy();
  });

  it('activates the first matching destination on submit', async () => {
    const props = baseProps(routeSession, { options });
    const screen = render(<MapBottomSheet {...props} />);
    fireEvent(screen.getByLabelText('Search destination'), 'submitEditing');
    await waitFor(() => expect(props.onFindRoad).toHaveBeenCalledWith('start', 'marathon'));
  });
});
