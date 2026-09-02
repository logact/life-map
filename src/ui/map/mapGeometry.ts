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
