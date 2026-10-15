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
  paused = false;
  get top() { return this.screens.at(-1); }
  get transitioning() { return !!this.transition; }
  get ids() { return this.screens.map(s => s.id); }
  private fade(direction: 'in' | 'out', duration: number, finish?: () => void) {
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
    const t = this.transition;
    if (t) {
      t.elapsed = Math.min(t.duration, t.elapsed + dt);
      if (t.elapsed >= t.duration) { this.transition = undefined; t.finish?.(); }
      return;
    }
    this.top?.update(dt);
  }
  input(event: ScreenInput) { if (!this.paused && !this.transition) this.top?.input(event); }
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
