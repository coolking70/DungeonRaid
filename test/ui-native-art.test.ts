import {expect,test} from 'vitest';
// @ts-ignore Node-only validation; the browser project intentionally excludes @types/node.
import {readFileSync} from 'node:fs';
// @ts-ignore Node-only validation.
import {createHash} from 'node:crypto';
import runtime from '../ui/generated/runtime.json';
import sources from '../art/native/sources.json';
import {Atlas} from '../ui/assets';
import {drawHud} from '../ui/hud';
import {fixture} from './turn-helpers';

test('all seven original textures, app icon and three BMFont files retain their recorded native bytes',()=>{
 expect(Object.keys(sources.sha256)).toHaveLength(11);
 for(const [name,hash] of Object.entries(sources.sha256))expect(createHash('sha256').update(readFileSync(new URL(`../art/native/${name}`,import.meta.url))).digest('hex')).toBe(hash);
});
test('native UI covers all semantic assets/states and never applies 2x menus coordinates to 512px texture',()=>{
 const assets=runtime.nativeUi.assets,ids=new Set(assets.map(a=>a.id));
 expect(ids).toEqual(new Set(runtime.ui.assets.map(a=>a.id)));
 expect(runtime.nativeUi.elements).toEqual(runtime.ui.elements);
 for(const a of assets){
  const limit=a.texture==='menus'?512:1024,[x,y,w,h]=a.rect;
  expect(x!+w!,a.id).toBeLessThanOrEqual(limit);expect(y!+h!,a.id).toBeLessThanOrEqual(limit);
  expect(x!).toBeGreaterThanOrEqual(0);expect(y!).toBeGreaterThanOrEqual(0);expect(w!).toBeGreaterThan(0);expect(h!).toBeGreaterThan(0);
  for(const v of Object.values(a.states??{}) as {asset?:string;overlay?:string}[])for(const id of [v.asset,v.overlay])if(id)expect(ids.has(id),`${a.id} → ${id}`).toBe(true);
 }
 expect(assets.find(a=>a.id==='ClassType.0')!.rect).toEqual([0,70,51,51]);
 expect(assets.find(a=>a.id==='RaceType.9')!.rect).toEqual([459,121,51,51]);
 expect(assets.find(a=>a.id==='SkillType.0')!.rect).toEqual([513,1,49,49]);
});
test('native equipment keeps all 400 original 49px cells, including the final accessory',()=>{
 const slots=runtime.nativeItems.slots;expect(slots).toHaveLength(400);
 expect(slots[0]!.rect).toEqual([1,1,49,49]);
 expect(slots[399]!.rect[0]).toBeCloseTo(951.57);expect(slots[399]!.rect[1]).toBeCloseTo(951.57);
 expect(new Set(slots.map(a=>a.rect.join(','))).size).toBe(400);
});
test('multi-texture atlas resolves semantic bindings and native 5px nine-slice without doubling corners',()=>{
 const manifest=structuredClone(runtime.nativeUi);
 for(const a of manifest.assets)delete (a as {tint?:number[]}).tint;
 const a=new Atlas('native',manifest),tiles={} as HTMLImageElement,menus={} as HTMLImageElement;
 a.images.set('tiles',tiles);a.images.set('menus',menus);
 const calls:unknown[][]=[],ctx={save(){},restore(){},drawImage(...v:unknown[]){calls.push(v);}} as unknown as CanvasRenderingContext2D;
 expect(a.paint(ctx,'pause.resume',0,0,89,26,'pressed')).toBe(true);
 expect(calls).toHaveLength(9);expect(calls[0]![0]).toBe(menus);expect(calls[0]!.slice(3)).toEqual([5,5,0,0,5,5]);
 calls.length=0;a.paint(ctx,'SkillType.0',0,0,49,49);expect(calls[0]![0]).toBe(tiles);expect(calls[0]!.slice(1,5)).toEqual([513,1,49,49]);
});
test('native health draws empty bottle before fill, while redrawn glass frame stays after fill',()=>{
 for(const original of [true,false]){
  const order:string[]=[],ctx=new Proxy({},{get:()=>()=>{}}) as CanvasRenderingContext2D;
  const ui={paint:(_c:unknown,id:string)=>order.push(id),fill:(_c:unknown,id:string)=>order.push(id)};
  drawHud(ctx,fixture(),{original,ui,items:{draw:()=>{}}} as never,{} as never,0);
  expect(order.indexOf('hud.health.frame')<order.indexOf('hud.health')).toBe(original);
 }
});
test('native BMFont glyph rectangles stay inside their textures and regular text covers printable ASCII',()=>{
 for(const font of Object.values(runtime.nativeFonts))for(const g of Object.values(font.chars)){
  expect(g.x+g.width).toBeLessThanOrEqual(128);expect(g.y+g.height).toBeLessThanOrEqual(128);
 }
 expect(Object.keys(runtime.nativeFonts.font.chars)).toHaveLength(95);
 expect(runtime.nativeFonts.font_menu.chars['65'].xadvance).toBe(15);
});
