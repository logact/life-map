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

  it('clamps hierarchy level independently from camera scale', () => {
    const deep = lifeMapSessionReducer(initialLifeMapSession, { type: 'set-level', level: 9 });
    expect(deep.semanticLevel).toBe(4);
    expect(deep.camera).toEqual(initialLifeMapSession.camera);
  });

  it('supports outcome filters and armed second-tap deletion', () => {
    const filtered = lifeMapSessionReducer(initialLifeMapSession, { type: 'toggle-filter', outcome: 'failed' });
    expect(filtered.filters).not.toContain('failed');
    const armed = lifeMapSessionReducer(filtered, { type: 'arm-delete', id: 'run' });
    expect(armed.deleteArmedId).toBe('run');
    expect(lifeMapSessionReducer(armed, { type: 'close-sheet' }).deleteArmedId).toBeUndefined();
  });
});
