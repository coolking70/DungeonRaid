export interface ScreenInput { type: 'down' | 'move' | 'up' | 'cancel'; x: number; y: number }
export interface Screen {
  readonly id: string;
  /** Overlays render the underlying screens, but only the top screen updates/receives input. */
  readonly overlay?: boolean;
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  input(event: ScreenInput): void;
}
// MainMenu::FadeIn/FadeOut @0x52ba0/@0x52b7c; GameMenu::Show @0x4430c;
// FoldoutMenu::Process @0x41fc4. Seconds, NOT a universal transition duration.
export const TRANSITIONS = { mainIn: .5, mainOut: .3, gameMenu: .2, foldout: .3 } as const;
type Transition = { elapsed: number; duration: number; direction: 'in' | 'out'; finish?: () => void };
export class ScreenStack {
  private screens: Screen[] = [];
  private transition?: Transition;
  private pending?: { owner: Screen; down: ScreenInput; up?: ScreenInput };
  private replayGuard = 0;
  private swallowing = false;
  paused = false;
  get top() { return this.screens[this.screens.length - 1]; }
  get transitioning() { return !!this.transition; }
  get ids() { return this.screens.map(s => s.id); }
  private fade(direction: 'in' | 'out', duration: number, finish?: () => void) {
    this.pending = undefined;
    if (duration <= 0) { finish?.(); return; }
    this.transition = { direction, duration, elapsed: 0, finish };
  }
  push(screen: Screen, duration: number = TRANSITIONS.gameMenu): boolean {
    if (this.transition) return false;
    this.screens.push(screen); screen.enter(); this.fade('in', duration); return true;
  }
  pop(duration: number = TRANSITIONS.gameMenu): boolean {
    if (this.transition || this.screens.length < 2) return false;
    this.fade('out', duration, () => this.screens.pop()!.exit()); return true;
  }
  replace(screen: Screen, fadeOut: number = TRANSITIONS.mainOut, fadeIn: number = TRANSITIONS.mainIn): boolean {
    if (this.transition) return false;
    this.fade('out', fadeOut, () => {
      this.screens.pop()?.exit(); this.screens.push(screen); screen.enter(); this.fade('in', fadeIn);
    }); return true;
  }
  update(dt: number) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    this.replayGuard = Math.max(0, this.replayGuard - dt);
    const t = this.transition;
    if (t) {
      t.elapsed = Math.min(t.duration, t.elapsed + dt);
      if (t.elapsed >= t.duration) { this.transition = undefined; t.finish?.(); if(t.direction === 'in') this.flushClick(); }
      return;
    }
    this.top?.update(dt);
  }
  private flushClick() {
    const p = this.pending;
    if (!p?.up || this.transition || p.owner !== this.top) return;
    this.pending = undefined; this.replayGuard = .25;
    p.owner.input(p.down);
    // A down-triggered menu may already have navigated. Never deliver up to a new screen.
    if (!this.transition && this.top === p.owner) p.owner.input(p.up);
  }
  input(event: ScreenInput) {
    if (event.type === 'cancel') {
      this.pending = undefined; this.swallowing = false;
      this.top?.input(event); return;
    }
    if (this.paused) return;
    if (this.swallowing) { if(event.type === 'up') this.swallowing = false; return; }
    if (event.type === 'down' && this.replayGuard > 0) { this.swallowing = true; return; }
    if (this.transition?.direction === 'out') return;
    if (this.transition || this.pending) {
      if (event.type === 'down' && !this.pending && this.top) this.pending = { owner: this.top, down: { ...event } };
      const p = this.pending;
      if (!p || p.up) return; // One tap per fade, even for a double click.
      if (event.type === 'move' && Math.hypot(event.x-p.down.x,event.y-p.down.y)>8) {
        this.pending = undefined; this.swallowing = true; return; // Do not replay drags.
      }
      if (event.type === 'up') {
        if (Math.hypot(event.x-p.down.x,event.y-p.down.y)>8) this.pending = undefined;
        else { p.up = { ...event }; this.flushClick(); }
      }
      return;
    }
    this.top?.input(event);
  }
  render(ctx: CanvasRenderingContext2D) {
    let first = this.screens.length - 1;
    while (first > 0 && this.screens[first]!.overlay) first--;
    for (let i = first; i < this.screens.length; i++) {
      ctx.save();
      if (i === this.screens.length - 1 && this.transition) {
        const t = this.transition, p = t.elapsed / t.duration;
        ctx.globalAlpha *= t.direction === 'in' ? p : 1 - p;
      }
      this.screens[i]?.render(ctx); ctx.restore();
    }
  }
}
