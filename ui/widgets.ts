import type { Assets } from './assets';
import { text } from './board-view';
export function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  ctx.font = "12px 'Fusion Pixel', monospace";
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    // Preserve words in English; CJK can break between glyphs.
    for (const part of paragraph.match(/[A-Za-z0-9+%()/:.-]+\s*|[^\x00-\x7f]|./gu) ?? []) {
      if (line && ctx.measureText(line+part).width>width) { lines.push(line.trimEnd()); line=''; }
      if (ctx.measureText(part).width>width) for (const ch of part) { if (ctx.measureText(line+ch).width>width) { lines.push(line); line=''; } line+=ch; }
      else line+=part;
    } lines.push(line.trimEnd());
  } return lines;
}
export function lines(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, max = 99, color = '#d2c9b5') {
  const all = wrap(ctx,value,width);
  all.slice(0,max).forEach((line,n) => text(ctx,n===max-1 && all.length>max ? line.replace(/.$/u,'…') : line,x,y+n*14,12,color,'left'));
  return all.length;
}
/** Tooltip::Show @0x65764; regular native lineHeight/base44/22 => 17.6px. */
export function tooltipRect(anchor: {x:number;y:number}, measured: number, count: number, offset = 0) {
  const line = 17.6, w = Math.min(316,measured+line+28), h = line*(count+1.5)+28;
  return { x: Math.max(2,Math.trunc(Math.min(anchor.x-5,320-w))), y: Math.max(2,Math.min(478-h,anchor.y>320 ? anchor.y-h-offset : anchor.y+offset)), w, h };
}
export class Tooltip {
  title = ''; body: string[] = []; anchor = {x:0,y:0}; alpha=0; showing=false;
  show(title: string, body: string[], x: number,y: number) { this.title=title; this.body=body; this.anchor={x,y}; this.showing=true; }
  hide() { this.showing=false; }
  update(dt: number) { this.alpha=Math.max(0,Math.min(240,this.alpha+(this.showing?1:-1)*dt*2040)); }
  draw(ctx: CanvasRenderingContext2D, assets: Assets) {
    if (!this.alpha) return;
    const titleLines=wrap(ctx,this.title,272), body=this.body.flatMap(s=>wrap(ctx,s,272));
    const visible=[...titleLines,...body].slice(0,24), measure=Math.max(...visible.map(s=>ctx.measureText(s).width),40);
    const r=tooltipRect(this.anchor,measure,visible.length-1,10);
    ctx.save(); ctx.globalAlpha=this.alpha/255;
    assets.ui.paint(ctx,'ui.panel',r.x,r.y,r.w,r.h);
    visible.forEach((line,n)=>text(ctx,line,r.x+13,r.y+23+n*17.6,12,n<titleLines.length?'#ffde92':'#e3dcd0','left'));
    ctx.restore();
  }
}
