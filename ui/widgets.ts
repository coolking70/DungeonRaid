import type { ScreenInput } from './screens';
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
  page=0; pages=1; controls:{id:string;x:number;y:number;w:number;h:number;delta:number}[]=[];
  private paging=false;
  input(e:ScreenInput):boolean {
    if(e.type==='cancel'){const used=this.paging;this.paging=false;return used;}
    if(this.paging){if(e.type==='up')this.paging=false;return true;}
    if(!this.showing||e.type!=='down')return false;
    const b=this.controls.find(b=>e.x>=b.x&&e.x<=b.x+b.w&&e.y>=b.y&&e.y<=b.y+b.h);
    if(!b)return false;
    this.page=Math.max(0,Math.min(this.pages-1,this.page+b.delta));this.paging=true;return true;
  }
  show(title: string, body: string[], x: number,y: number) { this.page=0;this.pages=1;this.controls=[]; this.title=title; this.body=body; this.anchor={x,y}; this.showing=true; }
  hide() { this.showing=false; }
  update(dt: number) { this.alpha=Math.max(0,Math.min(240,this.alpha+(this.showing?1:-1)*dt*2040)); }
  draw(ctx: CanvasRenderingContext2D, assets: Assets) {
    if (!this.alpha) return;
    const titleLines=wrap(ctx,this.title,272);
    const body=this.body.flatMap(s=>{
      const diff=s.match(/\((-?[\d.]+)%? >> (-?[\d.]+)%?\)/);
      const color=diff&&Number(diff[1])!==Number(diff[2])?(Number(diff[2])>Number(diff[1])?'#80e899':'#ff9393'):'#e3dcd0';
      return wrap(ctx,s,272).map(text=>({text,color}));
    });
    const capacity=Math.max(1,20-titleLines.length);
    this.pages=Math.max(1,Math.ceil(body.length/capacity));this.page=Math.min(this.page,this.pages-1);
    const visible=[...titleLines.map(text=>({text,color:'#ffde92'})),...body.slice(this.page*capacity,(this.page+1)*capacity)];
    const measure=Math.max(...visible.map(s=>ctx.measureText(s.text).width),this.pages>1?180:40);
    const r=tooltipRect(this.anchor,measure,visible.length-1+(this.pages>1?2:0),10);
    ctx.save(); ctx.globalAlpha=this.alpha/255;
    assets.ui.paint(ctx,'ui.panel',r.x,r.y,r.w,r.h);
    visible.forEach((line,n)=>text(ctx,line.text,r.x+13,r.y+23+n*17.6,12,line.color,'left'));
    this.controls=[];
    if(this.pages>1){
      const y=r.y+r.h-34;
      for(const [delta,x,label] of [[-1,r.x+12,'<'],[1,r.x+r.w-54,'>']] as const){
        ctx.fillStyle='#4c3a2c';ctx.fillRect(x,y,42,26);text(ctx,label,x+21,y+18,12,'#ffde92');
        this.controls.push({id:delta<0?'tooltip-prev':'tooltip-next',x,y,w:42,h:26,delta});
      }
      text(ctx,`${this.page+1}/${this.pages}`,r.x+r.w/2,y+18,12,'#ffde92');
    }
    ctx.restore();
  }
}
