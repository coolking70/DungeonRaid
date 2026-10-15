/** Game::SetupRenderer @0x26470; integer-truncated 2:3 viewport. CSS pixels in/out. */
export interface Viewport { x: number; y: number; width: number; height: number }
export function viewport(width: number, height: number): Viewport {
  const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height));
  if (w / h >= 0.6666667) {
    const width = Math.max(1, Math.floor(h * 0.6666667));
    return { x: Math.floor((w - width) / 2), y: 0, width, height: h };
  }
  const height2 = Math.max(1, Math.floor(w / 0.6666667));
  return { x: 0, y: Math.floor((h - height2) / 2), width: w, height: height2 };
}
export function logicalPoint(v: Viewport, x: number, y: number) {
  return { x: (x - v.x) * 320 / v.width, y: (y - v.y) * 480 / v.height };
}
export class CanvasViewport {
  value: Viewport = viewport(320, 480);
  constructor(readonly canvas: HTMLCanvasElement) {}
  resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    this.value = viewport(width, height);
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
  }
  begin(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const r = this.canvas.getBoundingClientRect(), v = this.value;
    const sx = this.canvas.width / r.width, sy = this.canvas.height / r.height;
    ctx.setTransform(sx * v.width / 320, 0, 0, sy * v.height / 480, sx * v.x, sy * v.y);
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath(); ctx.rect(0, 0, 320, 480); ctx.clip();
  }
  point(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return logicalPoint(this.value, clientX - r.left, clientY - r.top);
  }
}
