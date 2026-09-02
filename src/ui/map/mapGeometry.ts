import { ScreenPoint } from '../../application/map/projectionTypes';

const pointAt = (from: ScreenPoint, control: ScreenPoint, to: ScreenPoint, t: number): ScreenPoint => {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
};

const lerp = (left: ScreenPoint, right: ScreenPoint, t: number): ScreenPoint => ({
  x: left.x + (right.x - left.x) * t,
  y: left.y + (right.y - left.y) * t,
});

export const quadraticPath = (from: ScreenPoint, control: ScreenPoint, to: ScreenPoint): string =>
  `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;

export const quadraticPointAt = (from: ScreenPoint, control: ScreenPoint, to: ScreenPoint, t: number): ScreenPoint =>
  pointAt(from, control, to, t);

const quadraticTangentAt = (from: ScreenPoint, control: ScreenPoint, to: ScreenPoint, t: number): ScreenPoint => {
  const inverse = 1 - t;
  return {
    x: 2 * inverse * (control.x - from.x) + 2 * t * (to.x - control.x),
    y: 2 * inverse * (control.y - from.y) + 2 * t * (to.y - control.y),
  };
};

/**
 * Triangle at the curve endpoint, aligned with the arrival tangent and pulled
 * back by `tipInset` so the tip sits on the node marker edge instead of its center.
 */
export const arrowheadPath = (
  from: ScreenPoint,
  control: ScreenPoint,
  to: ScreenPoint,
  size = 9,
  tipInset = 0,
): string => {
  const tangent = quadraticTangentAt(from, control, to, 1);
  const length = Math.hypot(tangent.x, tangent.y) || 1;
  const unit = { x: tangent.x / length, y: tangent.y / length };
  const tip = { x: to.x - unit.x * tipInset, y: to.y - unit.y * tipInset };
  const base = { x: tip.x - unit.x * size, y: tip.y - unit.y * size };
  const halfWidth = size * 0.5;
  const normal = { x: -unit.y, y: unit.x };
  const cornerA = { x: base.x + normal.x * halfWidth, y: base.y + normal.y * halfWidth };
  const cornerB = { x: base.x - normal.x * halfWidth, y: base.y - normal.y * halfWidth };
  return `M ${tip.x} ${tip.y} L ${cornerA.x} ${cornerA.y} L ${cornerB.x} ${cornerB.y} Z`;
};

/** Nearest connection curve to a screen point, sampled along the quadratic, within maxDistance. */
export const closestConnectionId = (
  point: ScreenPoint,
  connections: { id: string; from: ScreenPoint; control: ScreenPoint; to: ScreenPoint }[],
  maxDistance: number,
): string | undefined => {
  let best: string | undefined;
  let bestDistance = maxDistance;
  for (const connection of connections) {
    for (let step = 0; step <= 20; step += 1) {
      const sample = pointAt(connection.from, connection.control, connection.to, step / 20);
      const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = connection.id;
      }
    }
  }
  return best;
};

export const quadraticSubpath = (
  from: ScreenPoint,
  control: ScreenPoint,
  to: ScreenPoint,
  start: number,
  end: number,
): string => {
  const subStart = pointAt(from, control, to, start);
  const subEnd = pointAt(from, control, to, end);
  const derivativeStart = lerp(from, control, start);
  const derivativeEnd = lerp(control, to, start);
  const startControl = lerp(derivativeStart, derivativeEnd, start);
  const span = Math.max(0.001, end - start);
  const subControl = {
    x: subStart.x + (startControl.x - subStart.x) * span,
    y: subStart.y + (startControl.y - subStart.y) * span,
  };
  return quadraticPath(subStart, subControl, subEnd);
};
