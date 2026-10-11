import Matter from 'matter-js';
import { WORLD, TrickTracker, evaluateScore, bounds, type Score, type Point } from './scoring';
const { Engine, Bodies, Body, Composite, Events } = Matter;
export type Phase = 'ready' | 'dragging' | 'flying' | 'result';
export type FinishLocation = 'oven' | 'oven-top' | 'floor' | 'counter' | 'out-of-view' | 'elsewhere';
export interface Impact { x: number; y: number; strength: number; tray: boolean }
export class Simulation {
  engine: Matter.Engine;
  fish: Matter.Body;
  tracker = new TrickTracker();
  phase: Phase = 'ready';
  time = 0;
  stableTime = 0;
  score: Score | null = null;
  finishLocation: FinishLocation | null = null;
  impacts: Impact[] = [];
  trayContact = false;
  otherSupport = false;
  private contacts = new Set<string>();
  private lastImpact = -1;
  private incomingSpeed = 0;
  private pendingBounce = false;
  private incomingVelocity: Point = { x: 0, y: 0 };
  constructor() {
    this.engine = Engine.create({ enableSleeping: false, positionIterations: 8, velocityIterations: 8 });
    this.engine.gravity.y = 1;
    const solid = (x: number, y: number, w: number, h: number, label: string, restitution = .35) =>
      Bodies.rectangle(x, y, w, h, { isStatic: true, label, friction: .6, restitution });
    // Coordinates match the visible cabinet, opening and tray.
    Composite.add(this.engine.world, [
      solid(757, 218, 286, 16, 'roof'), solid(894, 336, 16, 252, 'back'),
      solid(757, 458, 286, 20, 'oven-floor'), solid(620, 440, 16, 36, 'lip'),
      solid((WORLD.tray.left + WORLD.tray.right) / 2, WORLD.tray.top + 8,
        WORLD.tray.right - WORLD.tray.left, 16, 'tray', .05), solid(480, 492, 1080, 24, 'floor', .3),
      solid(110, 406, 172, 12, 'counter', .45),
    ]);
    const shape = [
      { x: -56, y: -12 }, { x: -24, y: -18 }, { x: 32, y: -16 }, { x: 56, y: -4 },
      { x: 56, y: 8 }, { x: 32, y: 16 }, { x: -24, y: 18 }, { x: -56, y: 12 },
    ];
    this.fish = Bodies.fromVertices(WORLD.start.x, WORLD.start.y, [shape], {
      label: 'fish', friction: .6, frictionStatic: 1, frictionAir: .0015,
      restitution: .22, density: .002, slop: .04,
    });
    Body.setStatic(this.fish, true);
    Composite.add(this.engine.world, this.fish);
    Events.on(this.engine, 'collisionStart', event => {
      if (this.phase !== 'flying') return;
      for (const pair of event.pairs) {
        if (pair.bodyA !== this.fish && pair.bodyB !== this.fish) continue;
        const other = pair.bodyA === this.fish ? pair.bodyB : pair.bodyA;
        if (other.label === 'tray') this.tracker.stopped = true;
        else if (!this.tracker.stopped && this.incomingSpeed > 2.5) this.pendingBounce = true;
        if (this.time - this.lastImpact > .08 && this.incomingSpeed > .7) {
          const p = pair.collision.supports[0] ?? this.fish.position;
          this.impacts.push({ x: p.x, y: p.y, strength: this.incomingSpeed, tray: other.label === 'tray' });
          this.lastImpact = this.time;
        }
      }
    });
  }
  launch(pull: Point, grab: Point = { x: 0, y: 0 }): boolean {
    if (this.phase !== 'ready' && this.phase !== 'dragging') return false;
    const length = Math.hypot(pull.x, pull.y);
    if (length < 8) { this.phase = 'ready'; return false; }
    const scale = Math.min(1, WORLD.maxPull / length);
    const vx = pull.x * scale * .103, vy = pull.y * scale * .103;
    Body.setStatic(this.fish, false);
    Body.setVelocity(this.fish, { x: vx, y: vy });
    // The cross product gives predictable spin from an off-centre release.
    Body.setAngularVelocity(this.fish, Math.max(-.34, Math.min(.34, (grab.x * vy - grab.y * vx) * .00082)));
    this.phase = 'flying';
    return true;
  }
  step() {
    if (this.phase !== 'flying') return;
    for (let sub = 0; sub < 4; sub++) {
      this.incomingSpeed = this.fish.speed;
      this.incomingVelocity = { ...this.fish.velocity };
      this.pendingBounce = false;
      const wasStopped = this.tracker.stopped;
      Engine.update(this.engine, 1000 / 240);
      this.time += 1 / 240;
      // Include the angle in the first tray-contact step before freezing tricks.
      const stopped = this.tracker.stopped;
      this.tracker.stopped = false;
      if (!wasStopped) this.tracker.update(this.fish.angle, this.fish.position.y);
      this.tracker.stopped = stopped;
      if (this.pendingBounce) {
        const v = this.fish.velocity, before = this.incomingVelocity;
        if (v.x * before.x + v.y * before.y < 0 && this.fish.speed > 1) this.tracker.bounce = true;
      }
      this.trayContact = false; this.otherSupport = false; this.contacts.clear();
      for (const pair of this.engine.pairs.list) {
        if (!pair.isActive || (pair.bodyA !== this.fish && pair.bodyB !== this.fish)) continue;
        const other = pair.bodyA === this.fish ? pair.bodyB : pair.bodyA;
        this.contacts.add(other.label);
        if (other.label === 'tray' && this.fish.position.y < WORLD.tray.top) this.trayContact = true;
        else this.otherSupport = true;
      }
      const slow = this.fish.speed < .18 && Math.abs(this.fish.angularVelocity) < .008;
      this.stableTime = slow ? this.stableTime + 1 / 240 : 0;
      if (this.stableTime >= .8) { this.finish(false); break; }
      if (this.fish.position.x < -100 || this.fish.position.x > 1100 || this.fish.position.y > 650) { this.finish(false); break; }
      if (this.time >= 10) { this.finish(true); break; }
    }
  }
  finish(timedOut: boolean) {
    this.score = evaluateScore({ vertices: this.fish.vertices, center: this.fish.position,
      angle: this.fish.angle, trayContact: this.trayContact, otherSupport: this.otherSupport,
      settled: this.stableTime >= .8, timedOut, turns: this.tracker.turns,
      highLob: this.tracker.highLob, bounce: this.tracker.bounce });
    const b = bounds(this.fish.vertices);
    const outside = b.maxX < 0 || b.minX > WORLD.width || b.maxY < 0 || b.minY > WORLD.height;
    this.finishLocation = this.score.inside ? 'oven' : outside ? 'out-of-view' :
      this.contacts.has('roof') && this.fish.position.y < 210 ? 'oven-top' :
      this.contacts.has('floor') ? 'floor' : this.contacts.has('counter') ? 'counter' : 'elsewhere';
    this.phase = 'result';
  }
  dispose() { Events.off(this.engine, 'collisionStart'); Composite.clear(this.engine.world, false); Engine.clear(this.engine); }
}
