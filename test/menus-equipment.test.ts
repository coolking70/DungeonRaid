import { expect, test } from 'vitest';
import { enumValue, GameMode, itemData } from '../src/core/data';
import { generateItem, increaseStat, isUpgradeAllowed, itemName, randomUpgrade, updateEquipmentStats } from '../src/core/equipment';
import { confirmMenu, generateMenu, requestMenu, selectMenuItem, skillDescription } from '../src/core/menus';
import { initialiseSkill, setSkill } from '../src/core/progression';
import { step } from '../src/core/engine';
import { fixture, settle } from './turn-helpers';
import { growthContext, levelDraws, nativeContext, type Draw } from './growth-helpers';

const shopDraws = (): Draw[] => [
  ['i',0,4,2,0], ['i',0,79,2,0], ['i',0,9,2,0], ['i',0,itemData.names.m_namesSword1.length-1,2,0],
  ['i',0,3,2,0], ['i',80,159,2,80], ['i',0,9,2,0], ['i',0,itemData.names.m_namesHelm.length-1,2,0],
  ['i',0,2,2,0], ['i',240,319,2,240], ['i',0,9,2,0], ['i',0,itemData.names.m_namesArmour.length-1,2,0], ['f',0,1,2,.9],
];
test('level menu draws SKILL four times in order, toggles selection, requires two and applies click order',()=>{
  const s=fixture(), c=growthContext(levelDraws()); requestMenu(s,'level',c); const m=s.menus[0]!;
  expect(m.candidates).toMatchObject([{kind:'skill',skill:{id:0}},{kind:'skill',skill:{id:1}},{kind:'stat',id:42,stat:0},{kind:'stat',id:43,stat:1}]); expect(c.rng.queue).toEqual([]);
  expect(()=>confirmMenu(s,m.id,c,'skip')).toThrow('cannot be skipped'); expect(()=>confirmMenu(s,m.id,c)).toThrow('required');
  selectMenuItem(s,m.id,1,c); selectMenuItem(s,m.id,0,c); selectMenuItem(s,m.id,2,c); expect(m.selected).toEqual([1,0]);
  selectMenuItem(s,m.id,1,c); expect(m.selected).toEqual([0]); selectMenuItem(s,m.id,1,c); confirmMenu(s,m.id,c);
  expect(s.skills.slice(0,2).map(k=>k!.id)).toEqual([0,1]); expect(s.phase).toBe('input');
});
test('shop interleaves slot/icon/prefix/suffix/stats ITEM calls, three choices, selected item recomputes stats',()=>{
  const s=fixture(), c=growthContext([...shopDraws(),['f',0,1,2,.9]]); requestMenu(s,'shop',c); const m=s.menus[0]!;
  expect(m.candidates.map(k=>k.kind==='item'?k.item.type:-1)).toEqual([0,1,2]); expect(c.rng.queue).toEqual([]);
  expect(()=>selectMenuItem(s,m.id,3,c)).toThrow('Invalid'); expect(()=>confirmMenu(s,m.id,c,'skip')).toThrow('skipped');
  selectMenuItem(s,m.id,0,c); selectMenuItem(s,m.id,1,c); expect(m.selected).toEqual([1]); confirmMenu(s,m.id,c);
  expect(s.equipment[1].stats[11]).toBe(2); expect(s.armour).toBe(5); expect(s.resources.gold.remainder).toBe(0);
  expect(itemName(s.equipment[1])).toBe(`${itemData.names.m_prefixes[0]!.text}  ${itemData.names.m_namesHelm[0]!.text}`);
});
test('upgrade menu interleaves four slot, weaken and stat UPGRADE draws; selection applies displayed step',()=>{
  const s=fixture(); const draws:Draw[]=[];
  for(let i=0;i<4;i++) draws.push(['i',0,4-i,4,0],['i',0,0,4,0],['i',0,[7,6,7,6][i]!,4,0]);
  const c=growthContext(draws); requestMenu(s,'upgrade',c); const m=s.menus[0]!;
  expect(m.candidates).toMatchObject([{kind:'upgrade',itemType:0,stat:0,value:1},{itemType:1,stat:6,value:1},{itemType:2,stat:10,value:10},{itemType:3,stat:0,value:1}]); expect(c.rng.queue).toEqual([]);
  expect(()=>confirmMenu(s,m.id,c,'skip')).toThrow('skipped'); selectMenuItem(s,m.id,2,c); confirmMenu(s,m.id,c); expect(s.health).toBe(60);
});
test('I1 rejects only non-exempt scroll path; wrong/missing fixture never silently filters',()=>{
  for(const supplied of [false,true]) { const s=fixture(); if(supplied)s.options.scrollFilter='supplied-native-fixture';
    const c=growthContext([...shopDraws(),['f',0,1,2,0],['i',0,2,2,0],['f',0,1,2,.5]]);
    expect(()=>generateMenu(s,'shop',c)).toThrow('I1'); expect(c.rng.queue).toEqual([]);
  }
});
test('I1 supplied raw words select exact native ID; buying applies stats before scroll without equipping or Dragonkin',()=>{
  const s=fixture(); s.options.scrollFilter='supplied-native-fixture'; s.character.race=enumValue('RaceType','RACE_DRAGONKIN');
  const c=growthContext([...shopDraws(),['f',0,1,2,0],['i',0,2,2,0],['f',0,1,2,.5],['i',0,0,2,0]]);
  const seen:number[]=[]; c.hooks={scrollNativeWord(_s,id){seen.push(id);return id===16?0:1;}};
  requestMenu(s,'shop',c); const m=s.menus[0]!; expect(m.candidates[0]).toMatchObject({kind:'item',scroll:{id:16}});
  selectMenuItem(s,m.id,0,c); confirmMenu(s,m.id,c);
  expect(s.equipmentStats.weaponDamage).toBe(3); expect(s.current.swordBoost).toBe(true); expect(s.skills).toEqual([null,null,null,null]); expect(c.rng.queue).toEqual([]);
  expect(seen).toEqual(Array.from({length:42},(_,i)=>i).filter(i=>i!==33)); expect(c.events).toContainEqual({type:'SkillCast',id:16,source:'scroll'});
});
test('I1 exemption bypasses raw memory; all ordinary target-independent skills remain eligible',()=>{
  const s=fixture(); const c=growthContext([...shopDraws(),['f',0,1,2,0],['i',0,2,2,0],['f',0,1,2,0]]);
  // Inspect last selection bounds independently through a wrapper rather than inventing a filter.
  const original=c.rng.randI.bind(c.rng); let poolSize=0;
  c.rng.randI=(a,b,lane)=>{if(lane===2&&c.rng.queue.length===0){poolSize=b+1;return 0;}return original(a,b,lane);};
  const m=generateMenu(s,'shop',c); expect(poolSize).toBeGreaterThan(0); expect(m.candidates[0]).toMatchObject({scroll:{id:7}});
});
test('Sauren scroll probability is50%, ordinary25%, same ITEM draw',()=>{
  for(const sauren of [false,true]) { const s=fixture(); if(sauren)s.character.race=enumValue('RaceType','RACE_SAUREN');
    const c=growthContext([...shopDraws(),['f',0,1,2,.4],...(sauren?[['i',0,2,2,0],['f',0,1,2,.5]] as Draw[]:[])]);
    if(sauren)expect(()=>generateMenu(s,'shop',c)).toThrow('I1'); else expect(generateMenu(s,'shop',c).candidates.every(k=>k.kind==='item'&&k.scroll===null)).toBe(true);
  }
});
test('CastSkill scroll source consumes selected shop purchase; cannot cast an owned skill for free',()=>{
  const s=fixture(), c=nativeContext(s); requestMenu(s,'shop',c); const m=s.menus[0]!, candidate=m.candidates[0]!; if(candidate.kind!=='item')throw new Error(); candidate.scroll=initialiseSkill(s,16);
  expect(()=>step(s,{type:'CastSkill',slot:0,source:'scroll'})).toThrow('selected shop');
  selectMenuItem(s,m.id,0,c); const result=step(s,{type:'CastSkill',slot:0,source:'scroll'});
  expect(result.state.menus).toEqual([]); expect(result.state.current.swordBoost).toBe(true); expect(result.state.equipment[candidate.item.type]).toEqual(candidate.item);
});
test('Enchant scroll nests upgrade menu without losing original committed-turn continuation',()=>{
  const s=fixture(); s.phase='arrivals'; s.resumePhase='enemy-attack'; s.actionCommitted=true;
  const c=nativeContext(s); requestMenu(s,'shop',c); const m=s.menus[0]!, candidate=m.candidates[0]!; if(candidate.kind!=='item')throw new Error(); candidate.scroll=initialiseSkill(s,10);
  selectMenuItem(s,m.id,0,c); confirmMenu(s,m.id,c); expect(s.menus[0]!.kind).toBe('upgrade'); expect(s.menuResumePhase).toBe('arrivals');
  const next=s.menus[0]!; selectMenuItem(s,next.id,0,c); confirmMenu(s,next.id,c); expect(s.phase).toBe('arrivals'); expect(s.resumePhase).toBe('enemy-attack');
});
test('all unavailable skills fill level menu with stats, Pretzel excludes HP/Teleport/TreasureChamber',()=>{
  const s=fixture(); for(const id of [0,1,2,33]){setSkill(s,initialiseSkill(s,id));s.skills[s.selectedSkillCount-1]!.level=10;}
  s.challenge=true;s.mode=GameMode.MODE_PRETZEL;Object.values(s.base.bonusToken);s.base.bonusToken={coin:100,potion:100,xp:100,shield:100};
  const c=growthContext([['i',0,5,3,5],['i',0,4,3,4],['i',0,3,3,3],['i',0,2,3,2]]);
  const m=generateMenu(s,'level',c); expect(m.candidates).toEqual([5,4,3,2].map(stat=>({kind:'stat',stat,id:42+stat})));
});
function itemDraws(type:number):Draw[]{const slot=itemData.slots[type]!, icon=slot.iconRangeInclusive[0]!;const mapping=itemData.nameMappings.find(m=>icon>=m.iconStart&&icon<m.iconEndExclusive)!;return [['i',slot.iconRangeInclusive[0]!,slot.iconRangeInclusive[1]!,2,icon],['i',0,9,2,0],['i',0,itemData.names[mapping.pool as keyof typeof itemData.names].length-1,2,0]];}
test.each([0,1,2,3,4])('shop slot%d preserves positive secondary stats on non-change branches',type=>{
  const s=fixture(); const old=s.equipment[type]!; old.stats[3]=4;
  const draws=itemDraws(type); if(type===2)draws.push(['f',0,1,2,.9]);draws.push(['f',0,1,2,.9]);if(type===4)draws.push(['f',0,1,2,.9]);
  const c=growthContext(draws), item=generateItem(s,old,c.rng);expect(item.stats[3]).toBe(4);expect(item.stats[type===0?0:type===4?10:11]).toBe(old.stats[type===0?0:type===4?10:11]!+(type===4?5:1));expect(c.rng.queue).toEqual([]);
});
test('weapon15% downgrade transfers one point to main damage; source remains unchanged',()=>{
  const s=fixture();s.equipment[0].stats[3]=2;const c=growthContext([...itemDraws(0),['f',0,1,2,.1]]);const item=generateItem(s,s.equipment[0],c.rng);
  expect(item.stats[0]).toBe(4);expect(item.stats[3]).toBe(0);expect(s.equipment[0].stats[3]).toBe(2);
});
test('helmet permits only one secondary upgrade and skips later50% draw',()=>{
  const s=fixture();s.equipment[1].stats[3]=s.equipment[1].stats[12]=2;
  const c=growthContext([...itemDraws(1),['f',0,1,2,0],['f',0,1,2,0],['f',0,1,2,0]]);const item=generateItem(s,s.equipment[1],c.rng);
  expect(item.stats[3]).toBe(4);expect(item.stats[12]).toBe(1);expect(item.stats[11]).toBe(3);expect(c.rng.queue).toEqual([]);
});
test('armour20% +2 branch copies all secondaries without more probability draws',()=>{
  const s=fixture();s.equipment[2].stats[3]=2;const c=growthContext([...itemDraws(2),['f',0,1,2,0]]);const item=generateItem(s,s.equipment[2],c.rng);expect(item.stats[11]).toBe(4);expect(item.stats[3]).toBe(2);expect(c.rng.queue).toEqual([]);
});
test('shield weapon70% loss increases armour; other20% loss can increase weapon damage',()=>{
  const s=fixture();s.equipment[3].stats[0]=s.equipment[3].stats[12]=2;
  const c=growthContext([...itemDraws(3),['f',0,1,2,0],['f',0,1,2,0],['f',0,1,2,0]]);const item=generateItem(s,s.equipment[3],c.rng);expect(item.stats[11]).toBe(3);expect(item.stats[0]).toBe(2);expect(item.stats[12]).toBe(1);
});
test('accessory ascending assignments overwrite random growth to an unvisited existing stat',()=>{
  const s=fixture();s.equipment[4].stats[8]=s.equipment[4].stats[9]=1;
  // Accessory without cooldown: pool8,9,10,17,18,19; choose9 while visiting8.
  const c=growthContext([...itemDraws(4),['f',0,1,2,0],['i',0,0,4,0],['i',0,5,4,1],['f',0,1,2,.9],['f',0,1,2,.9]]);
  const item=generateItem(s,s.equipment[4],c.rng);expect(item.stats[8]).toBe(0);expect(item.stats[9]).toBe(1);expect(item.stats[10]).toBe(15);expect(c.rng.queue).toEqual([]);
});
test('upgrade caps test current totals; Faithful regen2; Sprint removes weaken without a draw',()=>{
  const s=fixture();s.equipmentStats.leechPercent=24;increaseStat(s,s.equipment[0],2);expect(s.equipment[0].stats[2]).toBe(2);
  s.equipmentStats.leechPercent=25;expect(isUpgradeAllowed(s,2)).toBe(false);s.equipmentStats.pierceThreshold=95;expect(isUpgradeAllowed(s,4)).toBe(false);
  s.character.perks[0]=enumValue('PerkType','PERK_FAITHFUL');increaseStat(s,s.equipment[1],17);expect(s.equipment[1].stats[17]).toBe(2);
});
test('native text is available for all42 skills, including hidden40/41',()=>{for(let id=0;id<42;id++)expect(skillDescription(id).length).toBeGreaterThan(0);});
