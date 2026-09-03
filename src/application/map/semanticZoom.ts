/**
 * Semantic zoom policy: camera scale bands map to hierarchy levels, so the
 * pinch gesture is the only layer control. Zooming out always lands on the
 * parent-corridor overview; zooming in reveals milestones, then node groups,
 * then atomic detail with records.
 */
export const SEMANTIC_LEVEL_SCALE_MIN = [0.55, 0.85, 1.15, 1.5, 1.95];

export const semanticLevelForScale = (scale: number): number => {
  let level = 0;
  for (let index = 1; index < SEMANTIC_LEVEL_SCALE_MIN.length; index += 1) {
    if (scale >= SEMANTIC_LEVEL_SCALE_MIN[index]) level = index;
  }
  return level;
};

export const minScaleForSemanticLevel = (level: number): number =>
  SEMANTIC_LEVEL_SCALE_MIN[Math.max(0, Math.min(SEMANTIC_LEVEL_SCALE_MIN.length - 1, Math.round(level)))];
