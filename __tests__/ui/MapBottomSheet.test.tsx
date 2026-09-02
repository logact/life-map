import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PortraitMapProjection } from '../../src/application/map/projectionTypes';
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

const renderSheet = (session: LifeMapSessionState) => {
  const props = {
    session,
    projection,
    options: [],
    onClose: jest.fn(),
    onFindRoad: jest.fn(),
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
  };
  const screen = render(<MapBottomSheet {...props} />);
  return { screen, props };
};

describe('MapBottomSheet', () => {
  it('arms destructive actions with a second-tap confirmation', () => {
    const session: LifeMapSessionState = {
      ...initialLifeMapSession,
      mode: 'edit',
      sheet: 'detail',
      selection: { type: 'node', id: 'n1' },
    };
    const { screen, props } = renderSheet(session);
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
    const props = {
      session, projection: withConnection, options: [],
      onClose: jest.fn(), onFindRoad: jest.fn(), onToggleFilter: jest.fn(), onChangeOutcome: jest.fn(),
      onEditNode: jest.fn(), onDelete: jest.fn(), onInsert: jest.fn(), onBend: jest.fn(),
      onAddRecord: jest.fn(), onOpenRecord: jest.fn(), onCreate: jest.fn(), onConnect: jest.fn(),
      onArmDelete: jest.fn(), onSheetHeight: jest.fn(), onComposerDraft: jest.fn(),
    };
    const screen = render(<MapBottomSheet {...props} />);
    fireEvent.press(screen.getByText('Insert a node into this connection'));
    expect(props.onInsert).toHaveBeenCalledWith('c1');
  });
});
