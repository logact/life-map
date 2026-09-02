import { PortraitMapProjection } from '../../src/application/map/projectionTypes';
import { selectionFocusPoint } from '../../src/ui/map/selectionFocus';

const projection: PortraitMapProjection = {
  nodes: [{
    id: 'n1', title: 'Node', description: '', kind: 'task', outcome: 'todo',
    x: 100, y: 200, worldX: 100, worldY: 500, depthRank: 2, showLabel: true, filtered: false, onActiveRoute: false,
  }],
  connections: [{
    id: 'c1', fromNodeId: 'n1', toNodeId: 'n2', meaning: 'm', outcome: 'success',
    from: { x: 0, y: 100 }, control: { x: 50, y: 50 }, to: { x: 100, y: 0 },
    filtered: false, onActiveRoute: false,
  }],
  summaryConnections: [],
  segmentOverlays: [{
    id: 's1', title: 'Segment', description: '', hierarchyLevel: 0, memberCount: 3,
    bounds: { x: 10, y: 20, width: 100, height: 60 },
  }],
  recordAttachments: [{
    id: 'r1', targetId: 'n1', summary: 'Note', occurredAt: '2026-01-01',
    from: { x: 30, y: 40 }, to: { x: 100, y: 200 }, filtered: false,
  }],
  headerSummary: { title: '', detail: '', activeRoute: false },
  diagnostics: { semanticLevel: 0, visibleNodeIds: [], hiddenNodeIds: [], optionalLabelNodeIds: [], summaryCount: 0, worldCenter: { x: 0, y: 0 } },
};

describe('selectionFocusPoint', () => {
  it('anchors nodes, connections, segments, and records for above-sheet focus', () => {
    expect(selectionFocusPoint({ type: 'node', id: 'n1' }, projection)).toEqual({ x: 100, y: 200 });
    expect(selectionFocusPoint({ type: 'connection', id: 'c1' }, projection)).toEqual({ x: 50, y: 50 });
    expect(selectionFocusPoint({ type: 'segment', id: 's1' }, projection)).toEqual({ x: 60, y: 50 });
    expect(selectionFocusPoint({ type: 'record', id: 'r1' }, projection)).toEqual({ x: 30, y: 40 });
  });

  it('returns undefined for selections missing from the projection', () => {
    expect(selectionFocusPoint({ type: 'node', id: 'gone' }, projection)).toBeUndefined();
    expect(selectionFocusPoint({ type: 'summary', id: 'gone' }, projection)).toBeUndefined();
  });
});
