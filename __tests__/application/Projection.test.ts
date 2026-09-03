import { PortraitMapProjectionService } from '../../src/application/map/PortraitMapProjectionService';
import { resetCamera } from '../../src/application/map/camera';
import { LifeMapSnapshot, MapLayoutSnapshot, Outcome } from '../../src/domain/lifeMap/entities';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../fixtures/portraitRoadMapFixture';

const service = new PortraitMapProjectionService();
const snapshot = createPortraitRoadMapSnapshot();
const layout = createPortraitRoadMapLayout();
const viewport = { width: 390, height: 720 };

const project = (semanticLevel: number, centerX = 195) => service.project({
  snapshot,
  layout,
  viewport,
  camera: { ...resetCamera(), centerX },
  semanticLevel,
});

describe('PortraitMapProjectionService', () => {
  it('files nodes into layers by segment membership instead of rank', () => {
    const overview = project(0);
    const ids = overview.nodes.map((node) => node.id);
    // Nodes outside the featured road's tree stay at layer 0; every marathon
    // node is filed deep in the fixture, so only the permanent origin remains.
    expect(ids).toEqual(expect.arrayContaining(['start', 'plan-home', 'family-trip', 'studio', 'move-kyoto']));
    expect(ids).not.toEqual(expect.arrayContaining(['marathon', 'health-route', 'choose']));
    // The studio road bridges its hidden direction node; the marathon road's
    // hidden chain never reaches a visible endpoint, so it produces none.
    expect(overview.summaryConnections).toHaveLength(1);
    expect(overview.summaryConnections[0]).toEqual(expect.objectContaining({
      roadId: 'studio-road',
      fromNodeId: 'start',
      toNodeId: 'work-route',
    }));
    // Levels 1–3 reveal nothing new in the fixture: everything is filed at layer 4.
    expect(project(3).nodes).toHaveLength(overview.nodes.length);
    // Level 4 is the full map and the only Record level.
    expect(project(4).nodes).toHaveLength(snapshot.nodes.length);
    expect(project(3).recordAttachments).toHaveLength(0);
    expect(project(4).recordAttachments).toHaveLength(snapshot.records.length);
  });

  it('preserves ordered endpoint outcomes and factual hidden counts in summaries', () => {
    const bridge = project(0).summaryConnections.find((connection) => connection.roadId === 'studio-road')!;
    expect(bridge.hiddenCount).toBe(1);
    expect(bridge.hiddenNodeIds).toEqual(['choose']);
    expect(bridge.sections.flatMap((section) => section.connectionIds)).toEqual(['r1', 'r3']);
    expect(bridge.sections.map((section) => section.outcome)).toEqual(['success']);
  });

  it('derives every incoming edge style from its endpoint outcome', () => {
    const detail = project(4);
    const incoming = detail.connections.filter((connection) => connection.toNodeId === 'ten-k-checkpoint');
    expect(incoming.map((connection) => connection.outcome)).toEqual(['failed', 'failed']);
  });

  it('changes optional local labels when the camera pans at equal semantic level', () => {
    const health = project(1, 55).diagnostics.optionalLabelNodeIds;
    const work = project(1, 335).diagnostics.optionalLabelNodeIds;
    expect(health).not.toEqual(work);
    expect(health).toContain('plan-home');
    expect(work).toContain('work-route');
  });

  it('keeps ancestor layers as dimmed context behind the current level', () => {
    const compact = service.project({
      snapshot,
      layout,
      viewport: { width: 320, height: 568 },
      camera: resetCamera(),
      semanticLevel: 4,
    });
    const current = compact.segmentOverlays.filter((overlay) => !overlay.dimmed);
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((overlay) => overlay.hierarchyLevel === 4)).toBe(true);
    const context = compact.segmentOverlays.filter((overlay) => overlay.dimmed);
    expect(context.some((overlay) => overlay.hierarchyLevel === 0)).toBe(true);
    // Ancestors project first so they render behind the current level.
    expect(compact.segmentOverlays[0].hierarchyLevel).toBe(0);
    expect(compact.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    expect(project(0).segmentOverlays.every((overlay) => overlay.hierarchyLevel === 0 && !overlay.dimmed)).toBe(true);
  });
});

/**
 * Acceptance fixture from the segment-driven-layers plan: the user files the
 * skeleton a1→b1→c1 in the root corridor, the next milestones (a2, b2, c2) one
 * level deeper, and the remaining detail two levels deep. Zoom level L shows
 * exactly the points whose deepest filing is ≤ L, with summaries bridging the
 * hidden steps in between.
 */
const chainFixture = (): { chain: LifeMapSnapshot; chainLayout: MapLayoutSnapshot } => {
  const outcomes: Record<string, Outcome> = { a3: 'failed', b3: 'todo', b4: 'todo', c3: 'todo' };
  const chainIds = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3'];
  const nodeIds = ['start', ...chainIds];
  const connectionIds = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9'];
  const pairs = nodeIds.slice(0, -1).map((from, index) => [from, nodeIds[index + 1]] as const);
  const chain: LifeMapSnapshot = {
    version: 1,
    nodes: [
      { id: 'start', kind: 'status', title: 'Start', description: '', outcome: 'success', permanent: true },
      ...chainIds.map((id) => ({
        id,
        kind: (id === 'c3' ? 'goal' : 'task') as 'goal' | 'task',
        title: id,
        description: '',
        outcome: outcomes[id] ?? 'success',
      })),
    ],
    connections: pairs.map(([fromNodeId, toNodeId], index) => ({
      id: connectionIds[index],
      fromNodeId,
      toNodeId,
      meaning: 'then',
    })),
    roads: [{ id: 'road', title: 'Chain road', description: '', destinationGoalId: 'c3', rootSegmentId: 'root', featured: true }],
    segments: [
      { id: 'root', roadId: 'road', title: 'Journey', description: '', memberNodeIds: [...nodeIds], connectionIds: [...connectionIds] },
      {
        id: 'mid', roadId: 'road', parentSegmentId: 'root', title: 'Milestones', description: '',
        memberNodeIds: ['a2', 'a3', 'b2', 'b3', 'b4', 'c2', 'c3'], connectionIds: ['e2', 'e5', 'e6', 'e9'],
      },
      {
        id: 'deep', roadId: 'road', parentSegmentId: 'mid', title: 'Detail', description: '',
        memberNodeIds: ['a3', 'b3', 'b4', 'c3'], connectionIds: ['e6'],
      },
    ],
    records: [],
  };
  const chainLayout: MapLayoutSnapshot = {
    version: 1,
    placements: nodeIds.map((nodeId, index) => ({ nodeId, worldX: 195, depthRank: index })),
    recordPlacements: [],
    bends: [],
  };
  return { chain, chainLayout };
};

describe('segment-driven layers acceptance fixture', () => {
  const { chain, chainLayout } = chainFixture();
  const projectChain = (semanticLevel: number) => service.project({
    snapshot: chain,
    layout: chainLayout,
    viewport,
    camera: resetCamera(),
    semanticLevel,
  });

  it('level 0 shows the filed skeleton with summaries bridging the hidden steps', () => {
    const overview = projectChain(0);
    expect(overview.diagnostics.visibleNodeIds).toEqual(['a1', 'b1', 'c1', 'start']);
    expect(overview.summaryConnections.map((connection) => `${connection.fromNodeId}→${connection.toNodeId}`))
      .toEqual(['a1→b1', 'b1→c1']);
    const first = overview.summaryConnections[0];
    expect(first.hiddenNodeIds).toEqual(['a2', 'a3']);
    // Sections keep the canonical order and per-endpoint outcomes.
    expect(first.sections.map((section) => section.outcome)).toEqual(['success', 'failed', 'success']);
    expect(first.outcome).toBe('failed');
    const second = overview.summaryConnections[1];
    expect(second.hiddenNodeIds).toEqual(['b2', 'b3', 'b4']);
    expect(second.sections.map((section) => section.outcome)).toEqual(['success', 'todo', 'success']);
  });

  it('level 1 adds exactly the points filed one level deep', () => {
    const mid = projectChain(1);
    expect(mid.diagnostics.visibleNodeIds).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'start']);
    expect(mid.summaryConnections.map((connection) => `${connection.fromNodeId}→${connection.toNodeId}`))
      .toEqual(['a2→b1', 'b2→c1']);
  });

  it('level 2 shows the full chain with no summaries left to bridge', () => {
    const detail = projectChain(2);
    expect(detail.nodes).toHaveLength(chain.nodes.length);
    expect(detail.connections).toHaveLength(chain.connections.length);
    expect(detail.summaryConnections).toHaveLength(0);
  });

  it('merges parallel hidden branches into one summary per boundary pair', () => {
    const parallel: LifeMapSnapshot = {
      version: 1,
      nodes: [
        { id: 'start', kind: 'status', title: 'Start', description: '', outcome: 'success', permanent: true },
        { id: 'p', kind: 'task', title: 'P', description: '', outcome: 'success' },
        { id: 'q1', kind: 'task', title: 'Q1', description: '', outcome: 'todo' },
        { id: 'q2', kind: 'task', title: 'Q2', description: '', outcome: 'todo' },
        { id: 'z', kind: 'goal', title: 'Z', description: '', outcome: 'todo' },
      ],
      connections: [
        { id: 'f0', fromNodeId: 'start', toNodeId: 'p', meaning: 'begins' },
        { id: 'f1', fromNodeId: 'p', toNodeId: 'q1', meaning: 'branch one' },
        { id: 'f2', fromNodeId: 'p', toNodeId: 'q2', meaning: 'branch two' },
        { id: 'f3', fromNodeId: 'q1', toNodeId: 'z', meaning: 'rejoins' },
        { id: 'f4', fromNodeId: 'q2', toNodeId: 'z', meaning: 'rejoins' },
      ],
      roads: [{ id: 'road', title: 'Parallel road', description: '', destinationGoalId: 'z', rootSegmentId: 'root', featured: true }],
      segments: [
        { id: 'root', roadId: 'road', title: 'Journey', description: '', memberNodeIds: ['start', 'p', 'q1', 'q2', 'z'], connectionIds: ['f0', 'f1', 'f2', 'f3', 'f4'] },
        { id: 'inner', roadId: 'road', parentSegmentId: 'root', title: 'Branches', description: '', memberNodeIds: ['q1', 'q2'], connectionIds: ['f1', 'f2', 'f3', 'f4'] },
      ],
      records: [],
    };
    const parallelLayout: MapLayoutSnapshot = {
      version: 1,
      placements: [
        { nodeId: 'start', worldX: 195, depthRank: 0 },
        { nodeId: 'p', worldX: 195, depthRank: 1 },
        { nodeId: 'q1', worldX: 155, depthRank: 2 },
        { nodeId: 'q2', worldX: 235, depthRank: 2 },
        { nodeId: 'z', worldX: 195, depthRank: 3 },
      ],
      recordPlacements: [],
      bends: [],
    };
    const overview = service.project({ snapshot: parallel, layout: parallelLayout, viewport, camera: resetCamera(), semanticLevel: 0 });
    const merged = overview.summaryConnections.filter(
      (connection) => connection.fromNodeId === 'p' && connection.toNodeId === 'z',
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].hiddenNodeIds).toEqual(['q1', 'q2']);
    expect(merged[0].hiddenCount).toBe(2);
    // Summary ids stay unique at every semantic level.
    for (const level of [0, 1, 2, 3, 4]) {
      const ids = service.project({ snapshot: parallel, layout: parallelLayout, viewport, camera: resetCamera(), semanticLevel: level })
        .summaryConnections.map((connection) => connection.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
