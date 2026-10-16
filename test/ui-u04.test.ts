import { describe, test, expect, vi } from 'vitest';
import { fixture, select, tile, token } from './turn-helpers';
import { NativeRng, createRngState } from '../src/core/rng';
import { observeCosmetics, tokenDraws, particleDraws, labelDraw, type CosmeticSample } from '../src/core/cosmetics';
import { step } from '../src/core/engine';
import { TileType, enumValue } from '../src/core/data';
import { frameSounds, resourceSound, sampleSounds, selectionSound } from '../ui/cues';
import { SilentAudio } from '../ui/audio';
import { PresentationTimeline } from '../ui/timeline';
import { Heartbeat } from '../ui/effects';
import { arrowEdges } from '../ui/arrow';
import { tooltipRect } from '../ui/widgets';
import { Atlas } from '../ui/assets';
import { I18n } from '../ui/i18n';
import { candidateContent, equipmentName, statRewardLines } from '../ui/content';
import { SettlementSequence } from '../ui/settlement';
import runtime from '../ui/generated/runtime.json';
const i18n=()=>{const i=new I18n({getItem:()=>null,setItem:()=>{}});i.install('en',runtime.en);i.install('zh',runtime.zh);i.installCatalog(runtime.catalog);return i;};

describe('U04 consumed cosmetics are observational only',()=>{
 test('tap preserves every RNG lane and returns actual sampled token/particle values',()=>{
  const a=createRngState(),b=createRngState(),ra=new NativeRng(a),rb=new NativeRng(b),samples:CosmeticSample[]=[];
  ra.setRandSeed(12345,0);rb.setRandSeed(12345,0);observeCosmetics(rb,s=>samples.push(s));
  for(const r of [ra,rb]){tokenDraws(r,true);particleDraws(r,'shatter');labelDraw(r,3);}
  expect(a).toEqual(b);expect(samples.map(s=>s.values.length)).toEqual([5,33,1]);
  expect(samples[0]!.values[2]).toBeGreaterThanOrEqual(6);expect(samples[0]!.values[3]).toBeGreaterThanOrEqual(1);expect(samples[2]!.values).toEqual([.08]);
 });
 test('step exposes samples outside RunState, pairs resource event index, and cannot mutate rules',()=>{
  const s=select(fixture(),[0,1,2]),result=step(s,{type:'CommitChain'});
  const sample=result.cosmetics.find(v=>v.kind==='token')!;expect(result.events[sample.eventIndex!]?.type).toBe('EffectQueued');
  const saved=JSON.stringify(result.state);sample.values.fill(-100);expect(JSON.stringify(result.state)).toBe(saved);expect(saved).not.toContain('cosmetics');
 });
});
describe('U04 branch-filtered sound cues',()=>{
 test.each([[0,5],[1,14],[2,1],[3,7],[4,3],[6,8],[7,null]])('selection tile %s → %s',(type,id)=>{const s=fixture();expect(selectionSound(tile(s,0,type!))).toBe(id);});
 test('explosive/acid selection, no repeated/backtrack sound',()=>{const s=fixture();expect(selectionSound(tile(s,0,0,{acid:true}))).toBe(24);const after=select(s,[0]);expect(frameSounds(after,after,[{type:'ChainPreview',preview:after.preview}])).toEqual([]);expect(frameSounds(after,s,[{type:'ChainPreview',preview:s.preview}])).toEqual([]);});
 test('shield distinguishes repair, full armour and corrosive; potion variants are independent',()=>{
  const s=fixture();s.armour=1;expect(resourceSound(s,token(3))).toBe(6);s.armour=s.equipmentStats.maxArmour;expect(resourceSound(s,token(3))).toBe(8);s.armour=1;tile(s,0,1,{enemyType:enumValue('EnemyType','ENEMY_CORROSIVE')});expect(resourceSound(s,token(3))).toBe(8);expect(resourceSound(s,token(0,{variant:2}))).toBe(17);expect(resourceSound(s,token(0,{variant:1,skillSlot:0}))).toBe(4);expect(resourceSound(s,token(1,{variant:3}))).toBe(17);
 });
 test('no attack or ability payload causes no unconditional damage/ability sound',()=>{const s=fixture();expect(frameSounds(s,s,[{type:'EnemyAttack',attack:0,blocked:0,damage:0,armourLoss:0},{type:'EnemyAbility',slot:0,enemyType:1}])).toEqual([]);expect(frameSounds(s,s,[{type:'EnemyAttack',attack:3,blocked:3,damage:0,armourLoss:0}])).toEqual([14,27,15]);});
 test('spikes uses slash25, fire damage17 and top-row FleeUp is silent',()=>{const s=fixture();expect(frameSounds(s,s,[{type:'PlayerHealth',before:10,after:8,source:'spikes'}])).toEqual([25]);expect(frameSounds(s,s,[{type:'PlayerHealth',before:10,after:8,source:'fire'}])).toEqual([17]);expect(sampleSounds([{kind:'label',labelType:37,values:[.1],eventIndex:1}],[{type:'EnemyAbility',slot:0,enemyType:enumValue('EnemyType','ENEMY_FLEEING')}],s)).toEqual([]);});
 test('guarded special labels are used, help31 is never fabricated',()=>{expect(sampleSounds([{kind:'label',labelType:14,values:[.1]}])).toEqual([24]);expect(sampleSounds([{kind:'flare',values:[5]}])).toEqual([]);});
 test('resource audio occurs once at arrival; pause does not advance or replay',()=>{
  const s=fixture(),audio=new SilentAudio(),play=vi.spyOn(audio,'play'),timeline=new PresentationTimeline(s,audio),e=token(2,{targetSlot:0});
  timeline.enqueue(s,s,[{type:'EffectQueued',effect:e}],[{kind:'token',values:[.03,.04,6.7,1.2],eventIndex:0}]);timeline.enqueue(s,s,[{type:'EffectConsumed',id:e.id}]);expect(play).not.toHaveBeenCalled();expect(timeline.current!.tokens[0]!.flight.speed).toBe(6.7*320);
  timeline.paused=true;timeline.update(10);expect(play).not.toHaveBeenCalled();timeline.paused=false;for(let n=0;n<180;n++)timeline.update(1/60);expect(play).toHaveBeenCalledExactlyOnceWith(2,-1);timeline.update(10);expect(play).toHaveBeenCalledOnce();
 });
});
describe('U04 geometry and content',()=>{
 test('9-slice preserves10px source corners and5px target corners; state binding resolves',()=>{
  const atlas=new Atlas('ui',runtime.ui);atlas.image={} as HTMLImageElement;const calls:unknown[][]=[];const ctx={save(){},restore(){},drawImage(...a:unknown[]){calls.push(a);}} as unknown as CanvasRenderingContext2D;
  atlas.paint(ctx,'pause.resume',0,0,89,26,'pressed');expect(calls).toHaveLength(9);expect(calls[0]!.slice(3)).toEqual([10,10,0,0,5,5]);
 });
 test('all400 item slots,140 UI assets and182 bindings resolve',()=>{const items=new Atlas('items',runtime.items);expect(items.regions.size).toBe(400);expect(new Atlas('ui',runtime.ui).regions.has('hud.health')).toBe(true);expect(runtime.ui.elements).toHaveLength(182);});
 test('tooltip right/bottom boundaries use measured widths and native17.6 line height',()=>{const r=tooltipRect({x:310,y:470},180,3,10);expect(r.x+r.w).toBeLessThanOrEqual(320);expect(r.y+r.h).toBeLessThanOrEqual(470);expect(r.h).toBeCloseTo(17.6*4.5+28);});
 test('arrow straight width9; right angle miter and135° clamp retain finite geometry',()=>{const e=arrowEdges([{x:0,y:0},{x:53,y:0},{x:53,y:53}]);expect(e[0]!.left.y-e[0]!.right.y).toBe(9);expect(e[1]!.left.x).toBeCloseTo(48.5);expect(e[1]!.left.y).toBeCloseTo(4.5);});
 test('Chinese equipment prefix/noun, English double spaces, scroll translation and stat values',()=>{const s=fixture(),i=i18n();expect(equipmentName(i,s.equipment[0])).not.toMatch(/[A-Za-z]/);i.setLanguage('en');expect(equipmentName(i,s.equipment[0])).toContain('  ');i.setLanguage('zh');const c=candidateContent(i,{kind:'item',item:s.equipment[0],scroll:{id:1,level:1,charge:10,cooldown:10,active:false}},s);expect(c.lines.join('')).toContain('卷轴');expect(c.lines.join('')).not.toContain('item.scroll');const copy=structuredClone(s);expect(statRewardLines(i,6,s).join('')).toContain(`${s.base.maxHealth} >> ${s.base.maxHealth+10}`);expect(s).toEqual(copy);});
 test('heartbeat low/high threshold, pulse .3 and no high-health restarts',()=>{const audio=new SilentAudio(),play=vi.spyOn(audio,'play'),h=new Heartbeat();h.update(10,.36,audio);expect(play).not.toHaveBeenCalled();h.update(.1,.1,audio);expect(play).toHaveBeenCalledExactlyOnceWith(32,-1);expect(h.duration).toBe(.3);h.update(.3,1,audio);h.update(10,1,audio);expect(play).toHaveBeenCalledOnce();});
 test('settlement .2s icons then2s count, ready once',()=>{const s=fixture(),a=new SilentAudio(),play=vi.spyOn(a,'play'),seq=new SettlementSequence(s,a);seq.update(.2);expect(seq.visible).toBe(1);expect(seq.fraction).toBe(0);seq.update(10);expect(seq.ready).toBe(true);expect(play.mock.calls.filter(c=>c[0]===10)).toHaveLength(1);seq.update(10);expect(play.mock.calls.filter(c=>c[0]===10)).toHaveLength(1);});
});
