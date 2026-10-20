import type { Point } from './animation';
/** Arrow::Update @0x34f48. Screen-pixel equivalent of native normal/miter widths.
 * Native inserts extra degenerate vertices at bends; Canvas polygon joins approximate those subdivisions. */
export function arrowEdges(points: Point[]): { left: Point; right: Point }[] {
  const direction=(a:Point,b:Point)=>{const x=b.x-a.x,y=b.y-a.y,l=Math.hypot(x,y)||1;return{x:x/l,y:y/l};};
  return points.map((p,n)=>{
    const a=direction(points[Math.max(0,n-1)]!,points[n===0?1:n]!),b=direction(points[n]!,points[Math.min(points.length-1,n+1)]!);
    const d=n===0?a:n===points.length-1?a:{x:a.x+b.x,y:a.y+b.y};const l=Math.hypot(d.x,d.y)||1;
    const normal={x:-d.y/l,y:d.x/l};
    const width=n===0||n===points.length-1?4.5:4.5/Math.max(1/2.613126,Math.abs(normal.x*-a.y+normal.y*a.x));
    return{left:{x:p.x+normal.x*width,y:p.y+normal.y*width},right:{x:p.x-normal.x*width,y:p.y-normal.y*width}};
  });
}
export function drawArrow(ctx:CanvasRenderingContext2D,points:Point[],rune:boolean){
  if(points.length<2)return;const edges=arrowEdges(points),rgb=rune?'80,130,255':'50,255,50';
  ctx.save();
  for(let n=1;n<points.length;n++){
    const a=points[n-1]!,b=points[n]!,ea=edges[n-1]!,eb=edges[n]!;
    const gradient=ctx.createLinearGradient(a.x,a.y,b.x,b.y);gradient.addColorStop(0,`rgba(${rgb},${(100+100*n/points.length)/255})`);gradient.addColorStop(1,`rgba(${rgb},${(100+100*(n+1)/points.length)/255})`);ctx.fillStyle=gradient;
    ctx.beginPath();ctx.moveTo(ea.left.x,ea.left.y);ctx.lineTo(eb.left.x,eb.left.y);ctx.lineTo(eb.right.x,eb.right.y);ctx.lineTo(ea.right.x,ea.right.y);ctx.closePath();ctx.fill();
  }
  // End branch cVar9=5: expanded normal halfwidth .0140625+.025 =12.5px.
  const end=points[points.length - 1]!,prev=points[points.length - 2]!,a=Math.atan2(end.y-prev.y,end.x-prev.x);
  ctx.translate(end.x,end.y);ctx.rotate(a);ctx.fillStyle=`rgba(${rgb},${200/255})`;ctx.beginPath();ctx.moveTo(0,-12.5);ctx.lineTo(12.5,0);ctx.lineTo(0,12.5);ctx.closePath();ctx.fill();ctx.restore();
}
