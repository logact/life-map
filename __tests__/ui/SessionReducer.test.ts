import { lifeMapSessionReducer, initialLifeMapSession } from '../../src/ui/map/useLifeMapSession';

describe('Life Map session reducer', () => {
  it('cancels transient selection and sheets when mode changes', () => {
    const selected = lifeMapSessionReducer(initialLifeMapSession, {
      type: 'select',
      selection: { type: 'node', id: 'run' },
    });
    const edited = lifeMapSessionReducer(selected, { type: 'set-mode', mode: 'edit' });
    expect(edited.mode).toBe('edit');
    expect(edited.selection).toBeUndefined();
    expect(edited.sheet).toBeUndefined();
  });

  it('derives the hierarchy level from camera scale', () => {
    const zoomedOut = lifeMapSessionReducer(initialLifeMapSession, { type: 'set-camera', camera: { centerX: 195, centerY: 360, scale: 0.7 } });
    expect(zoomedOut.semanticLevel).toBe(0);
    const zoomedIn = lifeMapSessionReducer(zoomedOut, { type: 'set-camera', camera: { centerX: 195, centerY: 360, scale: 2.1 } });
    expect(zoomedIn.semanticLevel).toBe(4);
  });

  it('supports outcome filters and armed second-tap deletion', () => {
    const filtered = lifeMapSessionReducer(initialLifeMapSession, { type: 'toggle-filter', outcome: 'failed' });
    expect(filtered.filters).not.toContain('failed');
    const armed = lifeMapSessionReducer(filtered, { type: 'arm-delete', id: 'run' });
    expect(armed.deleteArmedId).toBe('run');
    expect(lifeMapSessionReducer(armed, { type: 'close-sheet' }).deleteArmedId).toBeUndefined();
  });

  it('tracks the path draft and clears it on release, selection, and mode change', () => {
    const draft = { fromNodeId: 'a', x: 10, y: 20, targetNodeId: 'b' };
    const dragging = lifeMapSessionReducer(initialLifeMapSession, { type: 'set-draft-path', draft });
    expect(dragging.draftPath).toEqual(draft);
    expect(lifeMapSessionReducer(dragging, { type: 'set-draft-path' }).draftPath).toBeUndefined();
    expect(lifeMapSessionReducer(dragging, { type: 'select', selection: { type: 'node', id: 'b' } }).draftPath).toBeUndefined();
    expect(lifeMapSessionReducer(dragging, { type: 'set-mode', mode: 'visual' }).draftPath).toBeUndefined();
  });

  it('keeps composer point and draft together and clears both on close', () => {
    const opened = lifeMapSessionReducer(initialLifeMapSession, {
      type: 'open-composer',
      point: { worldX: 100, depthRank: 3, connectionId: 'c-1' },
    });
    expect(opened.sheet).toBe('composer');
    expect(opened.composerPoint?.connectionId).toBe('c-1');
    const typed = lifeMapSessionReducer(opened, { type: 'set-composer-draft', draft: { title: 'Gym', kind: 'task', outcome: 'todo' } });
    expect(typed.composerDraft?.title).toBe('Gym');
    const closed = lifeMapSessionReducer(typed, { type: 'close-sheet' });
    expect(closed.composerPoint).toBeUndefined();
    expect(closed.composerDraft).toBeUndefined();
  });

  it('stores the measured sheet height without churning on sub-pixel changes', () => {
    const measured = lifeMapSessionReducer(initialLifeMapSession, { type: 'set-sheet-height', height: 320 });
    expect(measured.sheetHeight).toBe(320);
    expect(lifeMapSessionReducer(measured, { type: 'set-sheet-height', height: 320.4 })).toBe(measured);
  });
});
