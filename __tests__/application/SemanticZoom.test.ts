import { SEMANTIC_LEVEL_SCALE_MIN, minScaleForSemanticLevel, semanticLevelForScale } from '../../src/application/map/semanticZoom';

describe('semantic zoom policy', () => {
  it('maps camera scale bands to hierarchy levels', () => {
    expect(semanticLevelForScale(0.55)).toBe(0);
    expect(semanticLevelForScale(0.7)).toBe(0);
    expect(semanticLevelForScale(0.85)).toBe(1);
    expect(semanticLevelForScale(1.2)).toBe(2);
    expect(semanticLevelForScale(1.6)).toBe(3);
    expect(semanticLevelForScale(2.8)).toBe(4);
  });

  it('round-trips each level through its minimum scale', () => {
    for (let level = 0; level <= 4; level += 1) {
      expect(semanticLevelForScale(minScaleForSemanticLevel(level))).toBe(level);
    }
  });

  it('clamps out-of-range levels to the deepest band', () => {
    expect(minScaleForSemanticLevel(9)).toBe(SEMANTIC_LEVEL_SCALE_MIN[4]);
  });
});
