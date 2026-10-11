export interface Point { x: number; y: number }
export const WORLD = {
  width: 960, height: 540,
  start: { x: 224, y: 358 },
  oven: { left: 628, right: 886, top: 226, bottom: 448 },
  tray: { left: 656, right: 868, top: 398, edgeAllowance: 22 },
  maxPull: 145,
};

export interface FinishState {
  vertices: Point[];
  visibleVertices?: Point[];
  center: Point;
  angle: number;
  trayContact: boolean;
  otherSupport: boolean;
  settled: boolean;
  timedOut: boolean;
  turns: number;
  highLob: boolean;
  bounce: boolean;
}
export interface Score {
  total: number; base: number; flip: number; route: number; landing: number;
  onTray: boolean; inside: boolean; timedOut: boolean;
}
export function bounds(vertices: Point[]) {
  return { minX: Math.min(...vertices.map(v => v.x)), maxX: Math.max(...vertices.map(v => v.x)),
    minY: Math.min(...vertices.map(v => v.y)), maxY: Math.max(...vertices.map(v => v.y)) };
}
export function insideOven(vertices: Point[]): boolean {
  if (vertices.length < 3) return false;
  const o = WORLD.oven;
  // Pixel rounding and the offset collider can place a resting sprite a few pixels into a wall.
  const margin = 4;
  return vertices.every(v => Number.isFinite(v.x) && Number.isFinite(v.y) &&
    v.x >= o.left - margin && v.x <= o.right + margin && v.y >= o.top - margin && v.y <= o.bottom + margin);
}
export function evaluateScore(s: FinishState): Score {
  const b = bounds(s.vertices), t = WORLD.tray;
  const visible = s.visibleVertices ?? s.vertices;
  const footprint = bounds(visible);
  const inside = insideOven(visible);
  const onTray = inside && s.settled && !s.timedOut && s.trayContact && !s.otherSupport &&
    footprint.minX >= t.left - t.edgeAllowance && footprint.maxX <= t.right + t.edgeAllowance && s.center.y < t.top &&
    b.maxY >= t.top - 3 && b.maxY <= t.top + 3;
  const base = onTray ? 60 : inside ? 40 : 0;
  const flip = onTray ? Math.max(0, Math.floor(s.turns)) * 10 : 0;
  const route = onTray && (s.highLob || s.bounce) ? 10 : 0;
  const horizontal = Math.abs(Math.atan2(Math.sin(2 * s.angle), Math.cos(2 * s.angle))) / 2;
  const landing = onTray && Math.abs(s.center.x - (t.left + t.right) / 2) <= (t.right - t.left) * .15 && horizontal <= Math.PI / 12 ? 10 : 0;
  return { total: base + flip + route + landing, base, flip, route, landing, onTray, inside, timedOut: s.timedOut };
}

/** Track signed displacement, so oscillations cannot accumulate fake rotations. */
export class TrickTracker {
  private previous = 0;
  private displacement = 0;
  private maximum = 0;
  stopped = false;
  highLob = false;
  bounce = false;
  get turns() { return Math.floor((this.maximum + 1e-6) / (2 * Math.PI)); }
  update(angle: number, y: number) {
    if (this.stopped) return;
    // Matter angles are unbounded; do not wrap the per-step delta.
    this.displacement += angle - this.previous;
    this.previous = angle;
    this.maximum = Math.max(this.maximum, Math.abs(this.displacement));
    if (y < WORLD.oven.top - 40) this.highLob = true;
  }
}
