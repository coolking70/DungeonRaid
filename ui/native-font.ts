/** Original BMFont glyphs. The web layout chooses cap height; unsupported text uses Fusion Pixel. */
interface Glyph {x:number;y:number;width:number;height:number;xoffset:number;yoffset:number;xadvance:number}
interface Font {lineHeight:number;base:number;chars:Record<string,Glyph>}
type Kind='font'|'font_menu'|'font_score';
class NativeFonts {
  private fonts?:Record<string,Font>;
  private images=new Map<string,HTMLImageElement>();
  private tinted=new Map<string,HTMLCanvasElement>();
  clear(){this.fonts=undefined;this.images.clear();this.tinted.clear();}
  async load(fonts:Record<string,Font>,urls:Record<string,unknown>){
    this.clear();this.fonts=fonts;
    await Promise.all(Object.keys(fonts).map(async name=>{
      const img=new Image();await new Promise<void>(resolve=>{
        img.onload=()=>{this.images.set(name,img);resolve();};img.onerror=()=>resolve();img.src=urls[`../art/native/${name}.png`] as string;
      });
    }));
  }
  private layout(value:string,size:number,score=false,labelScale?:number){
    let kind:Kind=score?'font_score':'font',display=value;
    if(!score&&size>=18&&/^[a-zA-Z !,./:]+$/.test(value)){kind='font_menu';display=value.toUpperCase();}
    const font=this.fonts?.[kind],image=this.images.get(kind);
    if(!font||!image||[...display].some(ch=>!font.chars[String(ch.codePointAt(0))]))return;
    // Visible cap heights: regular=15px, menu=12px, score=18px (FNT glyph H/0); preserve advances/offsets.
    const native=labelScale!==undefined;
    const scale=native?labelScale*320/font.lineHeight:size/(kind==='font_menu'?12:kind==='font_score'?18:15);
    const width=[...display].reduce((n,ch)=>n+(native?(font.chars[String(ch.codePointAt(0))]!.width+font.chars[String(ch.codePointAt(0))]!.xadvance)/2:font.chars[String(ch.codePointAt(0))]!.xadvance),0)*scale;
    return {font,image,kind,display,scale,width,native};
  }
  // Tile::InitialiseLabels uses regular Font at Game+2c, not the score font.
  // AdjustCharacter + Label::SetText: half xoffset; advance=(width+xadvance)/2.
  drawLabel(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,scale:number,color:string,align:CanvasTextAlign){
    return this.draw(ctx,value,x,y,0,color,align,false,scale);
  }
  width(value:string,size:number,score=false){return this.layout(value,size,score)?.width;}
  draw(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,size:number,color:string,align:CanvasTextAlign,score=false,labelScale?:number){
    const run=this.layout(value,size,score,labelScale);if(!run)return false;
    const {font,image,kind,display,scale,width,native}=run,key=`${kind}:${color}`;
    let tinted=this.tinted.get(key);
    if(!tinted){
      tinted=document.createElement('canvas');tinted.width=image.width;tinted.height=image.height;
      const c=tinted.getContext('2d')!;c.drawImage(image,0,0);c.globalCompositeOperation='source-in';c.fillStyle=color;c.fillRect(0,0,image.width,image.height);this.tinted.set(key,tinted);
    }
    let cursor=x-(align==='center'?width/2:align==='right'||align==='end'?width:0);
    ctx.save();ctx.imageSmoothingEnabled=true;
    for(const ch of display){const g=font.chars[String(ch.codePointAt(0))]!;
      ctx.drawImage(tinted,g.x,g.y,g.width,g.height,cursor+g.xoffset*scale*(native?.5:1),y+(g.yoffset-font.base)*scale,g.width*scale,g.height*scale);cursor+=(native?(g.width+g.xadvance)/2:g.xadvance)*scale;
    }
    ctx.restore();return true;
  }
}
export const nativeFonts=new NativeFonts();
export function textWidth(ctx:CanvasRenderingContext2D,value:string,size=12){return nativeFonts.width(value,size)??ctx.measureText(value).width;}
