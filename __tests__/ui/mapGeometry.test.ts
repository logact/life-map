import { arrowheadPath, closestConnectionId, quadraticPointAt, quadraticSubpath } from '../../src/ui/map/mapGeometry';

describe('map geometry', () => {
  const from = { x: 0, y: 100 };
  const control = { x: 50, y: 50 };
  const to = { x: 100, y: 0 };

  it('evaluates the quadratic midpoint used by blocker badges', () => {
    expect(quadraticPointAt(from, control, to, 0.5)).toEqual({ x: 50, y: 50 });
  });

  it('builds an arrowhead triangle pulled back from the endpoint along the tangent', () => {
    const d = arrowheadPath(from, control, to, 10, 20);
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // Tangent at the end runs along (to - control) = (50, -50), unit (0.707, -0.707).
    expect(numbers).toHaveLength(6);
    expect(numbers[0]).toBeCloseTo(85.86, 1);
    expect(numbers[1]).toBeCloseTo(14.14, 1);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('keeps subpaths on the original curve for summary sections', () => {
    const subpath = quadraticSubpath(from, control, to, 0.25, 0.75);
    const start = quadraticPointAt(from, control, to, 0.25);
    expect(subpath.startsWith(`M ${start.x} ${start.y}`)).toBe(true);
  });

  it('finds the closest connection curve within a tolerance', () => {
    const connections = [{ id: 'c1', from, control, to }];
    expect(closestConnectionId({ x: 52, y: 48 }, connections, 10)).toBe('c1');
    expect(closestConnectionId({ x: 50, y: 90 }, connections, 10)).toBeUndefined();
  });
});
