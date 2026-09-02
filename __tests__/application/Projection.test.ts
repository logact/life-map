import { PortraitMapProjectionService } from '../../src/application/map/PortraitMapProjectionService';
import { resetCamera } from '../../src/application/map/camera';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../../src/infrastructure/memory/portraitRoadMapFixture';

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
  it('projects five semantic levels without exposing Records before evidence level', () => {
    expect(project(0).nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['start', 'marathon', 'family-trip', 'studio', 'move-kyoto']));
    expect(project(0).summaryConnections).toHaveLength(3);
    expect(project(1).nodes.map((node) => node.id)).toContain('health-route');
    expect(project(2).nodes).toHaveLength(snapshot.nodes.length);
    expect(project(3).recordAttachments).toHaveLength(0);
    expect(project(4).recordAttachments).toHaveLength(snapshot.records.length);
  });

  it('preserves ordered endpoint outcomes and factual hidden counts in summaries', () => {
    const overview = project(0);
    const marathon = overview.summaryConnections.find((connection) => connection.roadId === 'marathon-road')!;
    expect(marathon.hiddenCount).toBe(8);
    expect(marathon.sections.flatMap((section) => section.connectionIds)).toEqual(
      expect.arrayContaining(['r1', 'r5', 'r9', 'r12']),
    );
    expect(marathon.sections.map((section) => section.outcome)).toEqual(expect.arrayContaining(['success', 'todo', 'failed']));
  });

  it('derives every incoming edge style from its endpoint outcome', () => {
    const detail = project(2);
    const incoming = detail.connections.filter((connection) => connection.toNodeId === 'ten-k-checkpoint');
    expect(incoming.map((connection) => connection.outcome)).toEqual(['failed', 'failed']);
  });

  it('changes optional local labels when the camera pans at equal semantic level', () => {
    const health = project(1, 55).diagnostics.optionalLabelNodeIds;
    const work = project(1, 335).diagnostics.optionalLabelNodeIds;
    expect(health).not.toEqual(work);
    expect(health).toContain('health-route');
    expect(work).toContain('work-route');
  });

  it('selects the matching segment depth and remains finite on a compact viewport', () => {
    const compact = service.project({
      snapshot,
      layout,
      viewport: { width: 320, height: 568 },
      camera: resetCamera(),
      semanticLevel: 4,
    });
    expect(compact.segmentOverlays.every((overlay) => overlay.hierarchyLevel === 4)).toBe(true);
    expect(compact.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  });
});
