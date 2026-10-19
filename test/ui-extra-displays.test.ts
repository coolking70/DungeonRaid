import {expect,test} from 'vitest';
import {loadPreferences,togglePreference,preferenceDefaults} from '../ui/preferences';
import {drawStatusStrip} from '../ui/hud';
import {statsRows} from '../ui/content';
import {I18n} from '../ui/i18n';
import {fixture} from './turn-helpers';
const storage=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
test('existing profiles retain all three added displays by default; existing clock preferences survive',()=>{
 const s=storage();s.setItem('dungeonraid.clock','true');s.setItem('dungeonraid.dimming','false');
 const p=loadPreferences(s);expect(p).toEqual({...preferenceDefaults,clock:true,dimming:false});
});
test.each(['statusStrip','chainSummary','trophyProgress'] as const)('%s can toggle and persist without changing any other preference or save',key=>{
 const s=storage();s.setItem('dungeonraid.session.v2','unchanged saved run');const before=loadPreferences(s),p={...before};
 togglePreference(p,s,key);expect(p).toEqual({...before,[key]:false});expect(loadPreferences(s)).toEqual(p);
 expect(s.getItem('dungeonraid.session.v2')).toBe('unchanged saved run');togglePreference(p,s,key);expect(p).toEqual(before);
});
test('disabled browser storage permits in-memory display changes',()=>{
 const s={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},p=loadPreferences(s);
 expect(p).toEqual(preferenceDefaults);togglePreference(p,s,'statusStrip');expect(p.statusStrip).toBe(false);
});
test.each([false,true])('disabling status strip removes its band and labels independently of clock=%s',clock=>{
 const fills:unknown[][]=[],labels:string[]=[],ctx=new Proxy({fillRect:(...args:unknown[])=>fills.push(args),fillText:(text:string)=>labels.push(text)},{get:(o,k)=>Reflect.get(o,k)??(()=>{})}) as unknown as CanvasRenderingContext2D;
 drawStatusStrip(ctx,['Turn 1','Level 1','Score 0'],clock?'12:34':undefined,false);
 expect(fills).toEqual(clock?[[242,61,72,18]]:[]);expect(labels).toEqual(clock?['12:34']:[]);
});
test('hiding trophy progress keeps the original 17 attribute rows and leaves all state intact',()=>{
 const i=new I18n(storage()),s=fixture(),before=structuredClone(s),all=statsRows(i,s);
 expect(all).toHaveLength(18);expect(statsRows(i,s,false)).toEqual(all.slice(0,17));expect(s).toEqual(before);
});
