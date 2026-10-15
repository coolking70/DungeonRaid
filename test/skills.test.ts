import { expect, test } from 'vitest';
import { classData, enumValue, SpecialTileType, TileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { initialiseSkill, setSkill } from '../src/core/progression';
import { activateSkill, canActivate, canCastSkill, castSkill, fireBreath } from '../src/core/skills';
import { fixture, tile, settle } from './turn-helpers';
import { growthContext, nativeContext } from './growth-helpers';
import type { SkillFlags } from '../src/core/state';

/** Mixed board makes every native target predicate true; assertions inspect effects before arrivals. */
test.each(classData.skills.map(k => ({ id:k.nativeId, name:k.displayName.text })))('Skill $id $name dispatches its native effect', ({id}) => {
  const s=fixture(); s.turn=30; s.promotion.remaining=50;
  s.board.forEach((_,i)=>tile(s,i,i%5));
  tile(s,1,TileType.TILE_SKULL,{attack:5,defence:2,health:20});
  tile(s,31,TileType.TILE_SKULL,{enemyType:1,attack:5,defence:2,health:100,statsStatus:'special'});
  const before=structuredClone(s.board), c=nativeContext(s);
  setSkill(s,initialiseSkill(s,id)); expect(canActivate(s,id)).toBe(true); expect(canCastSkill(s,0)).toBe(true);
  castSkill(s,0,c);
  expect(c.events).toContainEqual({type:'SkillCast',id,source:'manual'});
  if(id!==33) expect(s.skills[0]!.charge).toBe(Math.min(0,s.skills[0]!.cooldown));
  expect(s.turn).toBe(30);
  const flags:Partial<Record<number,keyof SkillFlags>>={0:'steal',16:'swordBoost',17:'coinBoost',18:'potionBoost',19:'shieldBoost',22:'oneHealthSkulls',24:'forceCoin',34:'berserk',35:'rune',37:'lastStand'};
  if(flags[id]) { expect(s.current[flags[id]!]).toBe(true); expect(s.next[flags[id]!]).toBe(false); expect(s.skills[0]!.active).toBe(true); return; }
  const matches=c.events.filter(e=>e.type==='TileMatched').map(e=>e.slot);
  switch(id) {
    case 1: expect(s.board.filter(t=>t.type===1).every(t=>t.frozen)).toBe(true); break;
    case 2: expect(matches).toEqual([0,30,25,20,15,10,5,35]); expect(s.pending.every(e=>e.kind==='resource'&&e.tileType===0)).toBe(true); break;
    case 3: expect(matches.length).toBe(7); expect(s.pending.every(e=>e.kind==='resource'&&e.tileType===3)).toBe(true); break;
    case 4: expect(s.counterattack).toBe(true); break;
    case 5: expect(s.board[1]).toMatchObject({attack:1,defence:0}); expect(s.board[31]).toMatchObject({attack:5,defence:2}); break;
    case 6: expect(before.every((t,i)=>t.type!==4||s.board[i]!.type===2)).toBe(true); break;
    case 7: expect(s.board.every(t=>t.type!==1&&!t.newThisTurn)).toBe(true); expect(s.pending).toEqual([]); break;
    case 8: expect(s.board.filter(t=>t.type===0).every(t=>t.explosive)).toBe(true); break;
    case 9: expect(matches.length).toBe(8); expect(s.pending.every(e=>e.kind==='resource'&&e.tileType===1)).toBe(true); break;
    case 10: expect(s.menus[0]).toMatchObject({kind:'upgrade'}); expect(s.menus[0]!.candidates).toHaveLength(4); break;
    case 11: expect(s.combo.slash).toBe(true); expect(matches.length).toBeGreaterThanOrEqual(5); expect(matches.every(i=>Math.floor(i/6)===Math.floor(matches[0]!/6))).toBe(true); break;
    case 12: expect(matches.length).toBe(7); expect(s.pending.every(e=>e.kind==='resource'&&e.tileType===2)).toBe(true); break;
    case 13: expect(before.every((t,i)=>t.type!==4||s.board[i]!.type===3)).toBe(true); break;
    case 14: expect(s.board[1]!.type).toBe(4); expect(s.board[31]!.enemyType).toBe(1); break;
    case 15: expect(before.every((t,i)=>t.type!==2||s.board[i]!.type===4)).toBe(true); break;
    case 20: expect(s.board[31]).toMatchObject({enemyType:0,health:100,attack:5,defence:2,countdown:0}); break;
    case 21: expect(matches).toEqual([31]); expect(s.pending).toEqual([]); break;
    case 23: expect(s.board.filter(t=>t.promotedBySkill)).toHaveLength(1); expect(s.promotion.remaining).toBe(50); break;
    case 25: expect(s.board.filter(t=>t.magicSword)).toHaveLength(1); break;
    case 26: expect(s.board.map(t=>t.type)).not.toEqual(before.map(t=>t.type)); expect(s.board.map(t=>t.type).sort()).toEqual(before.map(t=>t.type).sort()); break;
    case 27: expect(s.board[1]!.health).toBe(14); expect(s.armour).toBe(4); break;
    case 28: expect(s.combo.fireball).toBe(true); expect(matches.length).toBeGreaterThanOrEqual(8); expect(matches.length).toBeLessThanOrEqual(9); break;
    case 29: expect(s.board.filter(t=>t.type===0).every(t=>t.mana)).toBe(true); break;
    case 30: expect(s.combo.hack).toBe(true); expect(s.board.filter((t,i)=>t.type!==before[i]!.type).every(t=>t.type===4)).toBe(true); break;
    case 31: expect(s.board.filter(t=>t.type===4).every(t=>t.arrow)).toBe(true); break;
    case 32: expect(s.combo.masochism).toBe(true); expect(before.every((t,i)=>t.type!==2||s.board[i]!.type===1)).toBe(true); break;
    case 33: expect(matches).toHaveLength(35); expect(s.skills).toEqual([null,null,null,null]); expect(s.selectedSkillCount).toBe(0); break;
    case 36: expect(matches.length).toBeGreaterThan(0); expect(matches.every(i=>before[i]!.type===1&&before[i]!.enemyType===0)).toBe(true); break;
    case 38: expect(s.combo.charge).toBe(true); expect(matches.every(i=>i%6===0||i%6===5||i<6||i>=30)).toBe(true); break;
    case 39: expect(s.board.filter(t=>t.specialType===SpecialTileType.SPECIAL_TILE_CHAIN)).toHaveLength(1); break;
    case 40: expect(s.combo.shock).toBe(true); expect(matches.every(i=>i<18&&[2,3].includes(before[i]!.type))).toBe(true); break;
    case 41: expect(s.combo.awe).toBe(true); expect(matches.every(i=>i>=18&&[0,3].includes(before[i]!.type))).toBe(true); break;
    default: throw new Error(`Missing skill assertion ${id}`);
  }
});

test.each([0,1,2,3,4,5,6,8,9,12,13,14,15,20,21,23,25,27,29,31,32,34,36])('CanActivate skill%d rejects missing target without consuming RNG', id=>{
  const s=fixture(); s.board.forEach((_,i)=>tile(s,i,TileType.TILE_SPECIAL,{specialType:SpecialTileType.SPECIAL_TILE_CHAIN}));
  setSkill(s,initialiseSkill(s,id)); expect(canActivate(s,id)).toBe(false); const before=structuredClone(s);
  expect(()=>step(s,{type:'CastSkill',slot:0,source:'manual'})).toThrow('Skill'); expect(s).toEqual(before);
});
test('manual charge guard uses equality; cooldown zero remains valid; Skill active is separate',()=>{
  const s=fixture(); setSkill(s,initialiseSkill(s,16)); s.skills[0]!.charge=13;
  expect(canCastSkill(s,0)).toBe(false); s.skills[0]!.charge=15; expect(canCastSkill(s,0)).toBe(false);
  s.skills[0]!.charge=s.skills[0]!.cooldown=0; expect(canCastSkill(s,0)).toBe(true); castSkill(s,0,nativeContext(s)); expect(s.current.swordBoost).toBe(true);
});
test('Dragonkin manual casts burn random ordinary enemy with base damage and fireSafe; empty pool still draws',()=>{
  const s=fixture(); s.character.race=enumValue('RaceType','RACE_DRAGONKIN'); s.equipmentStats.damage=99; tile(s,6,1); tile(s,1,1);
  setSkill(s,initialiseSkill(s,16)); const c=growthContext([['i',0,1,5,0]]); castSkill(s,0,c);
  expect(s.board[6]).toMatchObject({burning:true,fireSafe:true,fireDamage:3}); expect(s.board[1]!.burning).toBe(false);
  const empty=fixture(), noTarget=growthContext([['i',0,-1,5,-1]]); fireBreath(empty,noTarget); expect(noTarget.rng.queue).toEqual([]);
});
test('manual collection drains back to input without enemy turn, and clears refill new flags',()=>{
  const s=fixture(); setSkill(s,initialiseSkill(s,12)); const r=step(s,{type:'CastSkill',slot:0,source:'manual'});
  expect(r.state.phase).toBe('falling'); expect(r.state.board.every(t=>!t.newThisTurn)).toBe(true);
  const result=settle(r.state); expect(result.state.turn).toBe(0); expect(result.state.phase).toBe('input');
});
test('Haste stops after10 failed special-enemy coordinates',()=>{
  const s=fixture(); tile(s,0,1,{enemyType:1}); const c=growthContext(Array.from({length:20},()=>['i',0,5,5,0])); activateSkill(s,initialiseSkill(s,39),c);
  expect(c.rng.queue).toEqual([]); expect(s.board.some(t=>t.specialType===SpecialTileType.SPECIAL_TILE_CHAIN)).toBe(false);
});
test('conversion skips arrows and special skulls; normal potion variants remain exclusive',()=>{
  const s=fixture(); tile(s,0,4,{arrow:true}); tile(s,1,4,{magicSword:true}); tile(s,2,0,{mana:true});
  activateSkill(s,initialiseSkill(s,6),nativeContext(s)); expect(s.board[0]!.type).toBe(4); expect(s.board[1]!.type).toBe(2);
  activateSkill(s,initialiseSkill(s,8),nativeContext(s)); expect(s.board[2]).toMatchObject({mana:true,explosive:false});
});
test('Rune resolves before invalid two-effective-node arrow chain is cancelled, with no enemy turn',()=>{
  let s=fixture();s.current.rune=true;
  tile(s,8,4,{arrow:true});tile(s,20,4,{arrow:true});
  // Diamond8→15→20→13 has centre14; arrow-ignored coins leave only2 effective nodes.
  for(const slot of [8,15,20,13])s=step(s,{type:'SelectTile',at:{x:slot%6,y:Math.floor(slot/6)}}).state;
  expect(s.preview.effectiveLength).toBe(2);const r=step(s,{type:'CommitChain'});
  expect(r.state.board[14]!.matched).toBe(true);expect(r.state.chain.nodes).toEqual([]);expect(r.state.turn).toBe(0);
  expect(r.state.pending).toHaveLength(1);expect(settle(r.state).state.turn).toBe(0);
});
