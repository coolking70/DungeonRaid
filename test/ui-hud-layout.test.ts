import {afterEach,expect,test,vi} from 'vitest';
import runtime from '../ui/generated/runtime.json';
import {nativeFonts} from '../ui/native-font';
import {drawBoard} from '../ui/board-view';
import {drawStatusStrip} from '../ui/hud';
import {PresentationTimeline} from '../ui/timeline';
import {fixture,tile} from './turn-helpers';
afterEach(()=>{nativeFonts.clear();vi.unstubAllGlobals();});
async function fonts(){
 vi.stubGlobal('Image',class {width=128;height=128;onload=()=>{};set src(_v:string){this.onload();}});
 vi.stubGlobal('document',{createElement:()=>({getContext:()=>({drawImage(){},fillRect(){}})})});
 await nativeFonts.load(runtime.nativeFonts,{});
}
test('native enemy labels use regular font at scale .08 with distinct, non-overlapping attack/defence/health rows',async()=>{
 await fonts();const s=fixture();tile(s,0,1,{attack:1,defence:2,health:4,maxHealth:4});
 const calls:number[][]=[],ctx=new Proxy({drawImage:(_image:unknown,...args:number[])=>calls.push(args)},{get:(o,k)=>Reflect.get(o,k)??(()=>{})}) as unknown as CanvasRenderingContext2D;
 drawBoard(ctx,s,new PresentationTimeline(s),{tile(){},ui:{paint(){}}} as never);
 expect(calls).toHaveLength(3);
 // FNT regular '1'=(70,88,8,15); score font '1' is a different 12×18 glyph.
 expect(calls[0]!.slice(0,4)).toEqual([70,88,8,15]);
 expect(calls[0]![7]).toBeCloseTo(8.7272727);expect(calls[0]![5]).toBeCloseTo(83.0727273);
 expect(calls[0]![4]).toBeCloseTo(44.7636364); // native one-glyph optical correction -1.6
 expect(calls[1]![5]!-(calls[0]![5]!+calls[0]![7]!)).toBeGreaterThan(4);
 expect(calls[2]![5]!+calls[2]![7]!).toBeLessThan(132);
});
test('multi-digit native values stay in the tile and countdowns use the separate .13 scale',async()=>{
 await fonts();const calls:number[][]=[],ctx={save(){},restore(){},drawImage:(_i:unknown,...v:number[])=>calls.push(v)} as unknown as CanvasRenderingContext2D;
 nativeFonts.drawLabel(ctx,'999',50.590909,48.076923,.08,'red','right');
 expect(calls).toHaveLength(3);for(const c of calls){expect(c[4]).toBeGreaterThan(30);expect(c[4]!+c[6]!).toBeLessThan(51);}
 calls.length=0;nativeFonts.drawLabel(ctx,'3',23.3,21.333333,.13,'white','center');expect(calls[0]![7]).toBeCloseTo(14.1818182);
});
test.each([false,true])('status strip fits full large numbers within separate columns (clock=%s)',clock=>{
 const fills:unknown[][]=[],drawn:string[]=[],scales:number[]=[],ctx=new Proxy({fillRect:(...v:unknown[])=>fills.push(v),measureText:(v:string)=>({width:v.length*12}),fillText:(s:string)=>drawn.push(s),scale:(x:number)=>scales.push(x)},{get:(o,k)=>Reflect.get(o,k)??(()=>{})}) as unknown as CanvasRenderingContext2D;
 drawStatusStrip(ctx,['回合 12345','等级 99','分数 999999999'],clock?'23:59':undefined);
 expect(fills[0]).toEqual([0,61,320,18]);expect(drawn).toContain('分数 999999999');expect(drawn).toHaveLength(clock?4:3);
 expect(scales.every(s=>s>0&&s<=1)).toBe(true);
});
