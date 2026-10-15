import { expect, test } from 'vitest';
import { enumValue, GameMode, TileType, SpecialTileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { createRunState, defaultCharacter, hasFlaw, hasPerk } from '../src/core/state';
import { applyStatReward, claimTrophy, getSkillPool, initialiseSkill, setSkill, validateConfiguration } from '../src/core/progression';
import { addResource } from '../src/core/combat';
import { activateSkill } from '../src/core/skills';
import { fixture, select, tile, token } from './turn-helpers';
import { growthContext, nativeContext } from './growth-helpers';

test('NewGame accepts independent race/four perk/flaw slots/replacements, retains snapshot and starts with zero skills',()=>{
  const config=defaultCharacter(4);config.race=enumValue('RaceType','RACE_FAUN');
  config.perks=[4,9,7,5]; config.flaws=[1,4,5,6];config.replacementSkills=Array(20).fill(255);config.replacementSkills[1]=2;
  const input=createRunState();input.classLevels[4]=10;
  const r=step(input,{type:'NewGame',seed:42,classId:4,difficulty:1,mode:GameMode.MODE_CLASSIC,character:config});
  expect(r.state.character).toEqual(config);expect(r.state.character).not.toBe(config);expect(r.state.classLevels[4]).toBe(10);expect(r.state.selectedSkillCount).toBe(0);
  expect(r.state.base).toMatchObject({damage:4,maxHealth:40,bonusToken:{coin:30,shield:10}});expect(r.state.armour).toBe(3);expect(r.state.equipmentStats.pierceThreshold).toBe(30);
  expect(getSkillPool(r.state)).toContain(2);expect(getSkillPool(r.state)).not.toContain(3);
});
test('NONE never counts as a perk or flaw, repeated traits are presence-only',()=>{
  const s=fixture();expect(hasPerk(s,'PERK_NONE')).toBe(false);expect(hasFlaw(s,'FLAW_NONE')).toBe(false);
  s.character.perks=[4,4,4,4];expect(hasPerk(s,'PERK_STRONG')).toBe(true);
});
test('Validate removes duplicate traits/unpaired perks and restores pre5 default race; original replacement count does not enforce level cap',()=>{
  const config=defaultCharacter(1);config.race=0;config.perks=[6,6,4,5];config.flaws=[6,6,255,5];config.replacementSkills=Array(20).fill(2);
  const checked=validateConfiguration(config,2);expect(checked.perks).toEqual([6,255,255,5]);expect(checked.flaws).toEqual([6,255,255,5]);expect(checked.race).toBe(1);expect(checked.replacementSkills).toEqual(config.replacementSkills);
});
test.each([14,15])('Halfling direct chain%d kills grows body armour only at15 and retains deficit',count=>{
  const s=fixture();s.character.race=enumValue('RaceType','RACE_HALFLING');s.current.forceCoin=true;s.armour=1;s.combo.masochism=true;
  const path=[0,1,2,3,4,5,11,10,9,8,7,6,12,13,14].slice(0,count);
  path.forEach(i=>tile(s,i,TileType.TILE_SKULL,{health:1,maxHealth:1,attack:0}));
  const r=step(select(s,path),{type:'CommitChain'}).state;expect(r.kills.thisAttack).toBe(count);expect(r.equipment[2].stats[11]).toBe(count===15?3:2);expect(r.armour).toBe(count===15?2:1);
  expect(r.achievementQueue.some(e=>e.id===52)).toBe(count===15);expect(r.achievementQueue.some(e=>e.id===57)).toBe(count===15);
});
test.each([0,1])('trophy with no locked classes falls back to current class%d; mastered class gives no fabricated reward',id=>{
  const s=fixture();s.character=defaultCharacter(id);s.classLevels.fill(10);s.classLevels[id]=id===0?1:9;s.current.forceCoin=true;
  tile(s,0,TileType.TILE_SPECIAL,{specialType:SpecialTileType.SPECIAL_TILE_TROPHY});
  const c=growthContext(id===0?[]:[['i',0,1,5,0]]);claimTrophy(s,0,c);expect(s.classLevels[id]).toBe(id===0?2:10);
  const max=fixture();max.classLevels.fill(10);max.current.forceCoin=true;tile(max,0,TileType.TILE_SPECIAL,{specialType:SpecialTileType.SPECIAL_TILE_TROPHY});
  const none=growthContext([]);claimTrophy(max,0,none);expect(none.events).toContainEqual({type:'TrophyClaimed',slot:0,classId:null});expect(none.events.some(e=>e.type==='ClassLevelChanged')).toBe(false);
});
test.each([0,1,2,3,4,5,6,7])('stat reward%d has its native increments and never changes equipment',id=>{
  const s=fixture(), old=structuredClone(s);applyStatReward(s,id);
  const expected=[{strength:2,damage:4,bonusToken:{...old.base.bonusToken,xp:25}},{dexterity:2,repair:2,bonusToken:{...old.base.bonusToken,shield:25}},{vitality:2,maxHealth:45,bonusToken:{...old.base.bonusToken,potion:25}},{luck:2,healing:2,bonusToken:{...old.base.bonusToken,coin:25}},{damage:5},{repair:3},{maxHealth:50},{bonusToken:{coin:25,potion:25,xp:25,shield:25}}][id]!;
  expect(s.base).toMatchObject(expected);expect(s.equipment).toEqual(old.equipment);expect(s.health).toBe(id===2?55:id===6?60:50);
});
test('Pretzel ignores HP increase, caps each base bonus at100 and retains equipment bonus',()=>{
  const s=fixture();s.challenge=true;s.mode=GameMode.MODE_PRETZEL;s.base.bonusToken={coin:99,potion:100,xp:98,shield:100};s.equipmentStats.bonusToken.xp=20;
  applyStatReward(s,2);applyStatReward(s,6);applyStatReward(s,7);expect(s.health).toBe(50);expect(s.base.maxHealth).toBe(40);expect(s.base.bonusToken).toEqual({coin:100,potion:100,xp:100,shield:100});expect(s.equipmentStats.bonusToken.xp).toBe(20);
});
test('Wish compacts owned slots but a pending mana token retains its bound slot number',()=>{
  const s=fixture();for(const id of [33,2,3])setSkill(s,initialiseSkill(s,id));s.skills[1]!.charge=s.skills[2]!.charge=0;
  s.pending=[token(0,{variant:1,skillSlot:1})];activateSkill(s,s.skills[0]!,nativeContext(s));expect(s.pending[0]).toMatchObject({skillSlot:1});
  addResource(s,s.pending[0] as ReturnType<typeof token>,nativeContext(s));expect(s.skills[0]).toMatchObject({id:2,charge:0});expect(s.skills[1]).toMatchObject({id:3,charge:1});
});
test('already-created mana whose bound slot vanished uses native AddResource healing fallback',()=>{
  const s=fixture();s.health=10;addResource(s,token(0,{variant:1,skillSlot:3}),nativeContext(s));expect(s.health).toBe(11);
});
