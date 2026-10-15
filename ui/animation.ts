export interface Animation { elapsed: number; done: boolean; update(dt: number): void }
export class Tween implements Animation {
  elapsed = 0; done = false; value: number;
  constructor(readonly from: number, readonly to: number, readonly duration: number) { this.value = from; }
  update(dt: number) {
    this.elapsed += dt;
    const p = this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
    this.value = this.from + (this.to - this.from) * p; this.done = p === 1;
  }
}
/** ScoreScreen::Process @0x5dba8: per-frame interpolation, not seconds-based easing. */
export class FrameSnap implements Animation {
  elapsed = 0; done = false;
  constructor(public value: number, readonly target: number, readonly weight = .3, readonly epsilon = 2) {}
  update(dt: number) {
    this.elapsed += dt; this.value += (this.target - this.value) * this.weight;
    if (Math.abs(this.target - this.value) < this.epsilon) { this.value = this.target; this.done = true; }
  }
}
/** Tile::Process @0x628ec: native v=1,a=.5; both axes converted with *320. */
export class Fall implements Animation {
  elapsed = 0; done = false; velocity = 320;
  constructor(public y: number, readonly target: number) {}
  update(dt: number) {
    this.elapsed += dt; this.velocity += 160 * dt; this.y += this.velocity * dt;
    if (this.y >= this.target) { this.y = this.target; this.velocity = 320; this.done = true; }
  }
}
export interface Point { x: number; y: number }
/** Token::Process @0x65200, scale clamp from Thumb @0x552ca–f8.
 * U02 uses fixed midpoint cosmetic parameters: the engine already discarded its samples.
 * Never samples or advances the rule RNG. U04 can pass exposed native samples here. */
export class TokenFlight implements Animation {
  elapsed = 0; done = false; u = 0; scale = 1;
  readonly initialDistance: number;
  constructor(public position: Point, readonly target: () => Point,
    readonly direction: Point = { x: .1, y: 0 }, readonly speed = 6.5 * 320, readonly acceleration = 1.175) {
    const end = target(); this.initialDistance = Math.hypot(end.x - position.x, end.y - position.y);
  }
  update(dt: number) {
    this.elapsed += dt;
    const end = this.target(), dx = end.x - this.position.x, dy = end.y - this.position.y;
    const r = Math.hypot(dx, dy); this.u += this.acceleration * dt;
    const length = this.speed * dt * (this.u <= 1 ? 1 : this.u);
    if (r === 0 || length > r) { this.position = { ...end }; this.done = true; return; }
    const k = Math.min(1, this.u);
    this.position.x += length * ((1 - k) * this.direction.x + k * dx / r);
    this.position.y += length * ((1 - k) * this.direction.y + k * dy / r);
    this.scale = Math.max(.2, Math.min(1, r / (this.initialDistance || 1)));
  }
}
