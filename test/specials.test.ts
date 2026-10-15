import { describe, expect, test } from 'vitest';
import { generateStats, randomiseTile, setTileType } from '../src/core/board';
import { chainDamageFor, commitChain, updatePreview } from '../src/core/chain';
import { addResource, attackSkull, effectiveEnemy, enemyId, processAttack, refill, type RuleContext } from '../src/core/combat';
import { Difficulty, enumData, enumValue, GameMode, RandType, TileType, upgradeId } from '../src/core/data';
import { step } from '../src/core/engine';
import { downgradeStep, updateEquipmentStats } from '../src/core/equipment';
import { activateAbility, fleeingStab, getRewards, specialRewards } from '../src/core/specials';
import type { RandomSource } from '../src/core/rng';
import type { RunState, Tile } from '../src/core/state';
import { endOfTurn, enemyPoison } from '../src/core/turn';
import { context, fixture, tile, token } from './turn-helpers';
const { TILE_SKULL: skull, TILE_COIN: coin, TILE_POTION: potion, TILE_SWORD: sword, TILE_SHIELD: shield } = TileType;
/** Separate tapes by lane; deterministic lower bound for irrelevant refill cosmetics. */
class Tape implements RandomSource {
  calls: { a: number; b: number; lane: number }[] = [];
  cosmetic = 0;
  constructor(public lanes: Partial<Record<RandType, number[]>> = {}) {}
  randI(a: number, b: number, lane: RandType) { this.calls.push({ a, b, lane }); return this.lanes[lane]?.shift() ?? Math.min(a, b); }
  rand(_a: number, _b: number, _lane: RandType) { this.cosmetic++; return 0; }
  randUnitF(_lane: RandType) { this.cosmetic++; return 0; }
}
function ctx(lanes: Partial<Record<RandType, number[]>> = {}): RuleContext & { rng: Tape } { return { rng: new Tape(lanes), events: [] }; }
function special(s: RunState, slot: number, name: string, extra: Partial<Tile> = {}) { return tile(s, slot, skull, { enemyType: enemyId(name), statsStatus: 'special', ...extra }); }
function sealed(name: string, slot = 14) {
  const s = fixture(); s.turn = 100; s.promotion.remaining = 100; s.classLevels.fill(10); s.generated.total = s.generated.skulls = 0;
  s.board.forEach((_, i) => special(s, i, 'BOSS', { matched: true }));
  special(s, slot, name); return s;
}
function race(s: RunState, name: string) { s.character.race = enumValue('RaceType', `RACE_${name}`); }
function act(s: RunState, slot = 14, c = ctx()) { activateAbility(s, slot, c); return c; }

describe('07 E group — native special enemies', () => {
  test('E01 Boss has no active ability and deals its ordinary attack', () => {
    const s = fixture(); const boss = special(s, 0, 'BOSS', { attack: 3 }); const c = ctx();
    activateAbility(s, 0, c); expect(boss.attack).toBe(3); expect(boss.abilityUsed).toBe(true); expect(c.rng.calls).toEqual([]);
    s.armour = 0; processAttack(s, c); expect(s.health).toBe(47);
  });
  test('E02 two Spiky enemies cause one D10 direct hit ignoring armour', () => {
    let s = fixture(); s.base.damage = 10; s.armour = 100;
    special(s, 0, 'SPIKY', { health: 100 }); special(s, 1, 'SPIKY', { health: 100 }); tile(s, 2, sword, { broken: true });
    s.chain.nodes = [0, 1, 2]; commitChain(s, ctx());
    const effect = s.pending.find(e => e.kind === 'damage' && e.source === 'spikes')!;
    expect(effect).toMatchObject({ amount: 10 });
    s = step(s, { type: 'ConsumeEffect', id: effect.id }).state; expect(s.health).toBe(40); expect(s.armour).toBe(100);
  });
  test('E03 Golden countdown 1 runs away without reward and refills immediately', () => {
    const s = fixture(); s.turn = 100; special(s, 0, 'GOLDEN', { countdown: 1 }); const c = act(s, 0);
    expect(s.board[0]!.type).toBe(potion); expect(s.pending).toEqual([]); expect(s.board.every(t => !t.newThisTurn)).toBe(true);
    expect(c.events.some(e => e.type === 'TileGenerated')).toBe(true);
  });
  test('E04 Healer heals TWO others; blessing occurs only when none are wounded', () => {
    const s = sealed('HEALER'); tile(s, 0, skull, { health: 3, maxHealth: 20 }); tile(s, 1, skull, { health: 4, maxHealth: 30 });
    const c = act(s); expect([s.board[0]!.health, s.board[1]!.health]).toEqual([20, 30]);
    s.board[14]!.abilityUsed = false; act(s, 14, c); expect([s.board[0]!.attack, s.board[1]!.attack]).toEqual([2, 2]);
    expect(c.rng.calls.map(v => v.b)).toEqual([1, 0, 1, 0]);
  });
  test('E05 Halfling Invisible doubles generated ordinary defence, even marked', () => {
    const s = fixture(); s.turn = 100; race(s, 'HALFLING'); special(s, 14, 'INVISIBLE', { matched: true });
    const t = tile(s, 0, skull); generateStats(s, t, ctx().rng); expect(t.defence).toBe(4);
    tile(s, 14, coin); generateStats(s, t, ctx().rng); expect(t.defence).toBe(2);
  });
  test('E06 Acidic converts only the normal potion, not mana', () => {
    const s = sealed('ACIDIC'); tile(s, 0, potion); tile(s, 1, potion, { mana: true }); act(s);
    expect(s.board[0]!.acid).toBe(true); expect(s.board[1]!.acid).toBe(false);
  });
  test('E07 Flaming ignites eight neighbours except Flaming; repeat fire accumulates', () => {
    const s = fixture(); special(s, 14, 'FLAMING', { attack: 3 }); special(s, 15, 'FLAMING'); tile(s, 7, potion, { frozen: true });
    act(s); expect(s.board[7]).toMatchObject({ burning: true, frozen: false, fireDamage: 3 }); expect(s.board[15]!.burning).toBe(false);
    s.board[14]!.abilityUsed = false; act(s); expect(s.board[7]!.fireDamage).toBe(6); expect(s.board[0]!.burning).toBe(false);
  });
  test('E08 Freezing chooses two distinct normal targets and excludes special enemies', () => {
    const s = sealed('FROZEN'); tile(s, 0, potion); tile(s, 1, skull); special(s, 2, 'BOSS'); const c = act(s);
    expect(s.board[0]!.frozen && s.board[1]!.frozen).toBe(true); expect(s.board[2]!.frozen).toBe(false);
    expect(c.rng.calls).toEqual([{ a: 0, b: 1, lane: 5 }, { a: 0, b: 0, lane: 5 }]);
  });
  test('E09 Poisonous nemesis blocks potion detox and is immune to weapon poison', () => {
    const s = fixture(); race(s, 'ELF'); s.playerPoison = 4; s.health = 10; s.equipmentStats.poison = 2;
    const t = special(s, 0, 'POISONOUS'); addResource(s, token(potion), ctx()); attackSkull(s, 0, 0, true, ctx());
    expect(s.health).toBe(11); expect(s.playerPoison).toBe(4); expect(t.poison).toEqual([0, 0, 0]);
  });
  test('E10 Kamikaze halves HP, collects adjacent coin, leaves adjacent skull intact', () => {
    const s = sealed('KAMIKAZE'); s.health = 9; s.board[14]!.countdown = 1;
    tile(s, 13, coin); tile(s, 15, skull); act(s);
    expect(s.health).toBe(4); expect(s.board[14]!.matched).toBe(true); expect(s.board[13]!.matched).toBe(true);
    expect(s.board[15]!.matched).toBe(false); expect(s.pending).toHaveLength(1); expect(s.pending[0]).toMatchObject({ tileType: coin });
  });
  test('E11 Overseer uses SetType and Trap reduces only current HP', () => {
    const s = sealed('OVERSEER'); tile(s, 0, sword); s.current.oneHealthSkulls = true; act(s);
    expect(s.board[0]).toMatchObject({ type: skull, health: 1, maxHealth: 5, statsStatus: 'ordinary' });
  });
  test('E12 Corrosive turns shield into UP without repairing armour', () => {
    const s = fixture(); s.armour = 1; s.equipmentStats.maxArmour = 5; special(s, 0, 'CORROSIVE'); addResource(s, token(shield), ctx());
    expect(s.armour).toBe(1); expect(s.resources.upgrade.remainder).toBe(2);
  });
  test('E13 one coin is stolen without taking the second point from the gold bar', () => {
    const s = sealed('THIEF'); tile(s, 0, coin); s.resources.gold.remainder = 10; const c = act(s);
    expect(s.board[0]!.matched).toBe(true); expect(s.resources.gold.remainder).toBe(10); expect(s.pending).toEqual([]); expect(c.rng.calls).toHaveLength(1);
  });
  test('E14 Chaotic swaps into sole normal target then removes original-slot payload', () => {
    const s = sealed('CHAOTIC'); tile(s, 0, coin); act(s);
    expect(s.board[0]).toMatchObject({ enemyType: enemyId('CHAOTIC'), abilityUsed: true, matched: false, x: 0, y: 0 });
    expect(s.board[14]).toMatchObject({ type: coin, matched: true }); expect(s.pending).toEqual([]);
  });
  test('E15 Mage stops natural charge but allows a mana token', () => {
    const s = fixture(); special(s, 0, 'MAGE'); s.skills[0] = { id: 0, level: 1, charge: 3, cooldown: 8, active: true }; s.selectedSkillCount = 1;
    endOfTurn(s, ctx()); expect(s.skills[0]).toMatchObject({ charge: 3, active: false });
    addResource(s, token(potion, { variant: 1, skillSlot: 0 }), ctx()); expect(s.skills[0]!.charge).toBe(4);
  });
  test('E16 bottom-row Assassin deals twice attack through armour', () => {
    const s = fixture(); special(s, 30, 'ASSASSIN', { attack: 3 }); s.health = 10; s.armour = 100; act(s, 30);
    expect(s.health).toBe(4); expect(s.armour).toBe(100); expect(s.lastDamage).toBe('assassin');
  });
  test('E17 Doppelganger copies current armour, not capacity', () => {
    const s = sealed('DOPPELGANGER'); s.armour = 3; s.equipmentStats.maxArmour = 8; s.board[14]!.defence = 10; act(s); expect(s.board[14]!.defence).toBe(3);
  });
  test('E18 Alchemist randomises two distinct slots, allowing identical old/new type', () => {
    const s = sealed('ALCHEMIST'); tile(s, 0, potion); tile(s, 1, potion); const c = act(s);
    expect(s.generated.total).toBe(2); expect(s.board[0]!.type).toBe(potion); expect(s.board[1]!.type).toBe(potion);
    expect(c.rng.calls.filter(v => v.lane === 5)).toEqual([{ a: 0, b: 1, lane: 5 }, { a: 0, b: 0, lane: 5 }]);
  });
  test('E19 Unstable nemesis filters swords, redraws them, permits skulls', () => {
    const s = fixture(); s.turn = 100; race(s, 'CHANGELING'); special(s, 0, 'UNSTABLE', { countdown: 1 });
    const c = ctx({ 1: [4, 1, 1, 2, 5, 20] }); act(s, 0, c); expect(s.filter).toEqual({ enabled: true, excludeSwords: true });
    refill(s, c); expect(s.board[30]!.type).toBe(skull); expect(s.board.some(t => t.type === sword)).toBe(false);
    expect(c.rng.calls.filter(v => v.lane === 1).slice(0, 2)).toEqual([{ a: 0, b: 4, lane: 1 }, { a: 0, b: 4, lane: 1 }]);
  });
  test.each([false, true])('E20 Vampire grows beyond max only for Werewolf nemesis=%s', nemesis => {
    const s = fixture(); if (nemesis) race(s, 'WEREWOLF'); s.armour = 0; const t = special(s, 0, 'VAMPIRE', { attack: 3, health: 10, maxHealth: 10 });
    processAttack(s, ctx()); expect([t.health, t.maxHealth]).toEqual(nemesis ? [13, 13] : [10, 10]);
  });
  test('E21 Vengeful gains attack equal to three direct kills, never HP', () => {
    const s = fixture(); s.current.forceCoin = true; s.base.damage = 10;
    for (const n of [0, 1, 2]) tile(s, n, skull, { health: 1 }); special(s, 35, 'VENGEFUL', { attack: 4 });
    s.chain.nodes = [0, 1, 2]; commitChain(s, ctx()); expect(s.board[35]).toMatchObject({ attack: 7, health: 20 });
  });
  test('E22 Trampling breaks ordinary sword and excludes arrow', () => {
    const s = sealed('TRAMPLING'); tile(s, 0, sword); tile(s, 1, sword, { arrow: true }); act(s); expect(s.board[0]!.broken).toBe(true); expect(s.board[1]!.broken).toBe(false);
  });
  test('E23 Greasy includes top row and excludes its own skull', () => {
    const s = fixture(); special(s, 14, 'GREASY'); tile(s, 0, skull); act(s);
    expect(s.board[6]!.matched).toBe(true); expect(s.board[20]!.matched).toBe(false); expect(s.pending).toEqual([]);
  });
  test('E24 Alpha pairs external skull with adjacent non-skull once', () => {
    const s = sealed('ALPHA'); tile(s, 0, skull, { attack: 7 }); tile(s, 13, coin); const c = act(s);
    expect(s.board[13]).toMatchObject({ type: skull, attack: 7 }); expect(s.board[0]!.type).toBe(coin); expect(c.rng.calls).toHaveLength(2);
  });
  test('E25 Magnetic permits special-enemy destination', () => {
    const s = sealed('MAGNETIC'); tile(s, 0, sword); special(s, 13, 'SPIKY'); act(s);
    expect(s.board[13]!.type).toBe(sword); expect(s.board[0]!.enemyType).toBe(enemyId('SPIKY'));
  });
  test('E26 Brute throws only old normal skull HP7 as a variant3 damage token', () => {
    const s = sealed('BRUTE'); tile(s, 0, skull, { health: 7 }); tile(s, 1, skull, { health: 100, newThisTurn: true }); act(s);
    expect(s.board[0]!.matched).toBe(true); expect(s.board[1]!.matched).toBe(false);
    expect(s.pending).toHaveLength(1); expect(s.pending[0]).toMatchObject({ kind: 'resource', variant: 3, amount: 7 });
    addResource(s, s.pending[0] as Extract<RunState['pending'][number], { kind: 'resource' }>, ctx()); expect(s.health).toBe(43); expect(s.resources.xp.remainder).toBe(0);
  });
  test('E27 Armoured allows upward exit independent of entry column', () => {
    const s = fixture(); special(s, 14, 'ARMOURED'); expect(chainDamageFor(s, 14, [13, 14, 8], 10)).toBe(10); expect(chainDamageFor(s, 14, [13, 14, 20], 10)).toBe(0);
  });
  test('E28 Devourer removes HP upgrade by TEN and recomputes stats', () => {
    const s = sealed('DEVOURER'); s.equipment.forEach(i => i.stats.fill(0)); s.equipment[0].stats[upgradeId('maxHealth')] = 10; updateEquipmentStats(s);
    s.board[14]!.countdown = 1; act(s); expect(s.equipment[0].stats[upgradeId('maxHealth')]).toBe(0);
    expect(s.equipmentStats.maxHealth).toBe(0); expect(s.health).toBe(40); expect(s.board[14]!.countdown).toBe(5);
  });
  test('E29 Defiler guarantees all blocked armour loss with no OTHER draw', () => {
    const s = fixture(); special(s, 0, 'DEFILER', { attack: 3 }); s.armour = 5; const c = context(); processAttack(s, c);
    expect(s.armour).toBe(2); expect(s.health).toBe(50); expect(c.rng.calls).toEqual([]);
  });
  test('E30 both unselected Meat Shields absorb D10 while direct target is protected', () => {
    const s = fixture(); s.base.damage = 10; tile(s, 0, sword, { broken: true }); tile(s, 1, skull); tile(s, 2, sword, { broken: true });
    special(s, 34, 'MEAT_SHIELD'); special(s, 35, 'MEAT_SHIELD'); s.chain.nodes = [0, 1, 2]; commitChain(s, ctx());
    expect(s.board[34]!.health).toBe(10); expect(s.board[35]!.health).toBe(10); expect(s.board.find(t => t.type === skull && t.enemyType === 0)!.health).toBe(20);
  });
  test('E31 Fleeing climbs y1→0, escapes next activation; descent Stab uses GetAttack', () => {
    const s = fixture(); special(s, 6, 'FLEEING', { attack: 3 }); act(s, 6); expect(s.board[0]!.enemyType).toBe(enemyId('FLEEING'));
    s.board[0]!.abilityUsed = false; act(s, 0); expect(s.board[0]!.matched).toBe(true); expect(s.pending).toEqual([]);
    const fell = fixture(); special(fell, 24, 'FLEEING', { attack: 3 }); fell.board[30]!.matched = true; refill(fell, ctx()); expect(fell.health).toBe(47); expect(fell.lastDamage).toBe('fleeing');
  });
  test('E32 Lich direct death delays one ability, then regenerates at CURRENT turn', () => {
    const s = fixture(); s.turn = 100; const t = special(s, 0, 'LICH', { health: 1 }); const c = ctx();
    attackSkull(s, 0, 10, true, c); expect(t).toMatchObject({ countdown: 1, phylacteryDelayed: true, attack: 0, defence: 0 }); expect(s.pending).toEqual([]);
    act(s, 0, c); expect(t.countdown).toBe(1); expect(t.phylacteryDelayed).toBe(false);
    s.turn = 200; t.abilityUsed = false; act(s, 0, c); expect(t).toMatchObject({ countdown: 0, health: 40, attack: 6, defence: 8, statsStatus: 'special' });
    expect(c.rng.calls.filter(v => v.lane === 1)[0]).toEqual({ a: 3, b: 3, lane: 1 });
  });
  test('E33 poison-killed Lich receives special rewards without phylactery', () => {
    const s = fixture(); s.classLevels.fill(10); const t = special(s, 0, 'LICH', { health: 1, poison: [1, 0, 0] }); enemyPoison(s, ctx());
    expect(t.countdown).toBe(0); expect(t.matched).toBe(true); expect(s.pending).toHaveLength(15); expect(s.kills.total).toBe(0);
  });
});

// Independent expected A/D/H values for turn=100 Normal at lower-bound draws [1,2,5,20].
const stats = [
  [3,6,30], [2,2,15], [0,12,30], [2,4,20], [2,20,2], [2,4,20], [2,4,20], [2,4,20],
  [1,4,20], [1,4,30], [2,4,20], [2,4,20], [2,4,20], [2,4,20], [2,4,20], [3,4,15],
  [2,7,20], [2,4,20], [4,2,25], [2,4,20], [2,4,20], [2,4,20], [2,4,20], [2,4,20],
  [2,4,20], [2,4,20], [2,8,15], [2,4,20], [2,4,20], [0,2,25], [2,4,20], [2,4,20],
];
describe('32 additional single-enemy generation tests — GenerateStats @0x63098', () => {
  test.each(enumData.enums.EnemyType.filter(e => e.value >= 1 && e.value <= 32))('$name multipliers, countdown, exact common RNG calls', e => {
    const s = fixture(); s.turn = 100; s.armour = 7; const t = tile(s, 0, skull, { enemyType: e.value }); const c = ctx(); generateStats(s, t, c.rng);
    expect([t.attack, t.defence, t.health]).toEqual(stats[e.value - 1]); expect(t.maxHealth).toBe(t.health); expect(t.statsStatus).toBe('special');
    expect(t.countdown).toBe([3, 10, 19, 28].includes(e.value) ? 5 : 0);
    expect(c.rng.calls).toEqual([{ a: 1, b: 1, lane: 1 }, { a: 2, b: 2, lane: 1 }, { a: 5, b: 6, lane: 1 }, { a: 20, b: 30, lane: 1 }]);
  });
});

describe('special generation and spawn boundaries', () => {
  test('Noisy uses float32 AFTER multipliers; Invisible tail runs last; zero defence becomes one', () => {
    const s = fixture(); s.turn = 20; race(s, 'HALFLING'); s.character.flaws[0] = enumValue('FlawType', 'FLAW_NOISY');
    special(s, 1, 'INVISIBLE', { matched: true }); const t = special(s, 0, 'BOSS'); const c = ctx(); generateStats(s, t, c.rng);
    expect(t).toMatchObject({ attack: 3, defence: 6, health: Math.trunc(Math.fround(Math.fround(24) * Math.fround(1.05))), statsStatus: 'special' }); expect(t.maxHealth).toBe(t.health);
    expect(c.rng.calls).toHaveLength(4);
  });
  test('Corrosive spawn clears armour only for nemesis; Trap and third-special achievements are queued', () => {
    for (const nemesis of [false, true]) {
      const s = fixture(); s.turn = 100; s.promotion.remaining = 0; s.current.oneHealthSkulls = true; if (nemesis) race(s, 'ORC');
      special(s, 1, 'BOSS'); special(s, 2, 'BOSS', { matched: true });
      const c = ctx({ 1: [1, 12, 1, 2, 5, 20] }); randomiseTile(s, s.board[0]!, c.rng, c.events);
      expect(s.armour).toBe(nemesis ? 0 : 4); expect(s.board[0]).toMatchObject({ health: 1, maxHealth: 20, statsStatus: 'special' });
      expect(s.achievementQueue).toContainEqual({ id: 0x29, progress: 100 }); expect(s.achievementQueue).toContainEqual({ id: 0x3e, progress: 100 });
      expect(c.events.some(e => e.type === 'SpecialEnemyPending')).toBe(false);
    }
  });
  test('Fleeing spawn JumpDown preserves fixed slots and does not Stab', () => {
    const s = fixture(); s.turn = 100; s.promotion.remaining = 0; tile(s, 30, shield, { broken: true });
    const first = s.board[0], last = s.board[30], c = ctx({ 1: [1, 31, 1, 2, 5, 20] }); randomiseTile(s, s.board[0]!, c.rng, c.events);
    expect(s.board[0]).toBe(first); expect(s.board[30]).toBe(last);
    expect(s.board[30]).toMatchObject({ enemyType: 31, x: 0, y: 5, statsStatus: 'special' }); expect(s.board[0]).toMatchObject({ type: shield, broken: true }); expect(s.health).toBe(50);
  });
  test('SetType preserves abilityUsed, which native @0x64ef8 never resets', () => {
    const s = fixture(); s.turn = 100; s.board[0]!.abilityUsed = true;
    setTileType(s, s.board[0]!, skull, ctx().rng); expect(s.board[0]!.abilityUsed).toBe(true);
  });
  test('NewGame retains supplied class-level snapshot for Trophy eligibility', () => {
    const s = fixture(); s.classLevels.fill(10);
    const next = step(s, { type: 'NewGame', seed: 1, classId: 0, difficulty: 1, mode: GameMode.MODE_CLASSIC }).state;
    expect(next.classLevels).toEqual(s.classLevels); expect(next.classLevels).not.toBe(s.classLevels);
  });
});

describe('native target ordering, abilityUsed and countdown boundaries', () => {
  test.each(['ACIDIC', 'OVERSEER'])('%s consumes R(0,-1,OTHER) even without candidates', name => {
    const s = sealed(name); const c = act(s); expect(c.rng.calls).toEqual([{ a: 0, b: -1, lane: 5 }]);
  });
  test('Acidic column scan includes marked targets and excludes explosive potions', () => {
    const s = sealed('ACIDIC'); tile(s, 6, potion, { matched: true }); tile(s, 1, potion); tile(s, 0, potion, { explosive: true }); act(s);
    expect(s.board[6]!.acid).toBe(true); expect(s.board[1]!.acid).toBe(false); expect(s.board[0]!.acid).toBe(false);
  });
  test('Overseer may naturally promote a marked sword; SetType does not run RandomiseTile spawn hooks', () => {
    const s = sealed('OVERSEER'); s.promotion.remaining = 0; s.armour = 4; race(s, 'ORC'); tile(s, 0, sword, { matched: true });
    act(s, 14, ctx({ 1: [12, 1, 2, 5, 20] })); expect(s.board[0]).toMatchObject({ enemyType: 12, matched: true, statsStatus: 'special' }); expect(s.armour).toBe(4);
  });
  test.each(['HEALER', 'FROZEN', 'ALCHEMIST', 'TRAMPLING', 'CHAOTIC', 'ALPHA', 'MAGNETIC', 'BRUTE'])('%s empty target set consumes no OTHER RNG', name => {
    const s = sealed(name); const c = act(s); expect(c.rng.calls).toEqual([]);
  });
  test.each(['GOLDEN', 'KAMIKAZE', 'UNSTABLE', 'DEVOURER'])('%s countdown 0 decrements to -1 without firing', name => {
    const s = fixture(); const t = special(s, 0, name, { countdown: 0 }); const c = act(s, 0);
    expect(t.countdown).toBe(-1); expect(t.matched).toBe(false); expect(c.rng.calls).toEqual([]); expect(s.health).toBe(50);
  });
  test('Freezing uses row-major set order; Brute vector uses column-major order', () => {
    const frozen = sealed('FROZEN'); tile(frozen, 1, coin); tile(frozen, 6, coin); const c = ctx({ 5: [0, 0] }); act(frozen, 14, c);
    expect(c.rng.calls).toHaveLength(2);
    const brute = sealed('BRUTE'); tile(brute, 1, skull, { health: 9 }); tile(brute, 6, skull, { health: 7 }); act(brute);
    expect(brute.pending[0]).toMatchObject({ amount: 7, targetSlot: 6 });
    const healer = sealed('HEALER'); tile(healer, 1, skull, { health: 1 }); tile(healer, 6, skull, { health: 2 }); tile(healer, 7, skull, { health: 3 }); act(healer);
    expect(healer.board[1]!.health).toBe(20); expect(healer.board[6]!.health).toBe(20); expect(healer.board[7]!.health).toBe(3);
  });
  test('Chaotic moved into a later traversal slot activates once, no global arbitration', () => {
    const s = fixture(); s.turn = 100; special(s, 0, 'CHAOTIC'); const c = ctx({ 5: [34] }); endOfTurn(s, c);
    expect(c.events.filter(e => e.type === 'EnemyAbility' && e.enemyType === enemyId('CHAOTIC'))).toHaveLength(1);
    expect(s.board[35]).toMatchObject({ enemyType: enemyId('CHAOTIC'), abilityUsed: true });
  });
  test('EndOfTurn visits new and marked specials in x-outer/y-inner order', () => {
    const s = fixture(); s.turn = 100;
    special(s, 1, 'BOSS', { matched: true }); special(s, 6, 'BOSS', { newThisTurn: true });
    const c = ctx(); endOfTurn(s, c);
    expect(c.events.filter(e => e.type === 'EnemyAbility').map(e => e.slot)).toEqual([6, 1]);
  });
  test('Frozen nemesis halves only base damage, not sword contribution', () => {
    const s = fixture(); race(s, 'DRAGONKIN'); s.base.damage = 7; special(s, 35, 'FROZEN'); tile(s, 0, sword); tile(s, 1, skull);
    s.chain.nodes = [0, 1]; updatePreview(s); expect(s.preview.damage).toBe(5);
  });
  test('Thief nemesis damages only when stealing bar points, not board coins', () => {
    const s = sealed('THIEF'); race(s, 'SAUREN'); s.resources.gold.remainder = 1; s.board[14]!.attack = 3; act(s);
    expect(s.health).toBe(47); expect(s.resources.gold.remainder).toBe(0); expect(s.lastDamage).toBe('thief');
    const board = sealed('THIEF'); race(board, 'SAUREN'); tile(board, 0, coin); act(board); expect(board.health).toBe(50);
  });
  test('Assassin nemesis clears below unless it is a special enemy', () => {
    const s = sealed('ASSASSIN'); race(s, 'FAUN'); tile(s, 20, coin); act(s); expect(s.board[20]!.matched).toBe(true);
    s.board[14]!.abilityUsed = false; special(s, 20, 'BOSS'); act(s); expect(s.board[20]!.matched).toBe(false);
  });
  test('Kamikaze killed directly still explodes neighbours and also gives rewards', () => {
    const s = sealed('KAMIKAZE'); tile(s, 13, coin); s.board[14]!.health = 1; attackSkull(s, 14, 10, true, ctx());
    expect(s.health).toBe(50); expect(s.board[13]!.matched).toBe(true); expect(s.pending).toHaveLength(16);
  });
  test('Fleeing Stab immediately ends the game or consumes Last Stand', () => {
    for (const protect of [false, true]) {
      const s = fixture(); s.health = 1; s.current.lastStand = protect; special(s, 0, 'FLEEING', { attack: 3 }); fleeingStab(s, 0, ctx());
      expect(s.outcome?.cause ?? null).toBe(protect ? null : 'fleeing'); expect(s.health).toBe(protect ? 50 : 0);
    }
  });
  test('Fleeing death during chain refill leaves terminal queues and phase clean', () => {
    const s = fixture(); s.health = 1; special(s, 24, 'FLEEING', { attack: 3 }); s.chain.nodes = [30, 31, 32]; commitChain(s, ctx());
    expect(s.phase).toBe('ended'); expect(s.outcome?.cause).toBe('fleeing'); expect(s.pending).toEqual([]); expect(s.moving).toEqual([]); expect(s.resumePhase).toBeNull();
  });
});

describe('GetRewards / Trophy / Changeling', () => {
  test.each([
    ['GOLDEN', [0, 0, 15, 0], [[15, 25]]],
    ['HEALER', [3, 9, 3, 0], [[15, 25], [3, 5], [9, 3]]],
    ['ARMOURED', [0, 9, 3, 3], [[15, 25], [3, 5], [9, 3]]],
    ['THIEF', [0, 8, 7, 0], [[15, 25], [11, 7]]],
    ['BOSS', [0, 10, 5, 0], [[15, 25], [11, 5]]],
  ] as const)('%s exact composition, native reversed ranges and token ordering', (name, counts, ranges) => {
    const c = ctx(); const rewards = getRewards(enemyId(name), c);
    expect([potion, skull, coin, shield].map(type => rewards.filter(t => t === type).length)).toEqual(counts);
    expect(c.rng.calls).toEqual(ranges.map(([a, b]) => ({ a, b, lane: 1 })));
    if (name === 'HEALER') expect(rewards).toEqual([...Array(3).fill(potion), ...Array(3).fill(coin), ...Array(9).fill(skull)]);
    if (name === 'ARMOURED') expect(rewards).toEqual([...Array(3).fill(shield), ...Array(3).fill(coin), ...Array(9).fill(skull)]);
  });
  test('Golden kill gets 15 coins; trophy SetType consumes COSMETIC after reward flights', () => {
    const s = fixture(); s.turn = 100; special(s, 14, 'GOLDEN', { health: 1, attack: 0, countdown: 5 });
    const c = ctx({ 0: [23, 6] }); attackSkull(s, 14, 20, true, c);
    expect(s.pending).toHaveLength(15); expect(s.pending.every(e => e.kind === 'resource' && e.tileType === coin)).toBe(true);
    expect(s.trophies).toEqual({ remaining: 23, awarded: 1 });
    expect(s.board[14]).toMatchObject({ type: TileType.TILE_SPECIAL, specialType: 1, matched: false, appearance: 6 });
    expect(c.rng.calls.filter(v => v.lane === 0)).toEqual([{ a: 20, b: 30, lane: 0 }, { a: 0, b: 7, lane: 0 }]);
    // Shatter33 + 15 coin flights*4; no XP flight fifth draw.
    expect(c.rng.cosmetic).toBe(93);
    // MatchTile re-reads enemy after Trophy reset; Golden achievement only survives without a Trophy.
    expect(s.achievementQueue).not.toContainEqual({ id: 0x2c, progress: 100 });
  });
  test('Golden non-trophy kill queues Golden achievement; rewards draw no OTHER', () => {
    const s = fixture(); s.classLevels.fill(10); special(s, 0, 'GOLDEN', { health: 1 }); const c = ctx(); attackSkull(s, 0, 20, true, c);
    expect(s.achievementQueue).toContainEqual({ id: 0x2c, progress: 100 }); expect(c.rng.calls.every(v => v.lane === 1)).toBe(true);
  });
  test.each([49, 50])('Sprint trophy probability boundary R=%s', roll => {
    const s = fixture(); s.challenge = true; s.mode = GameMode.MODE_SPRINT; s.trophies.remaining = 1; special(s, 14, 'BOSS', { matched: true });
    const c = ctx({ 0: [roll, 20, 0] }); specialRewards(s, 14, c);
    expect(s.trophies.awarded).toBe(roll < 50 ? 1 : 0); expect(s.trophies.remaining).toBe(roll < 50 ? 20 : 1);
    expect(c.rng.calls.filter(v => v.lane === 0)[0]).toEqual({ a: 0, b: 100, lane: 0 });
  });
  test('Sprint already-due Trophy can appear even when probability does not decrement', () => {
    const s = fixture(); s.challenge = true; s.mode = GameMode.MODE_SPRINT; special(s, 14, 'BOSS', { matched: true });
    specialRewards(s, 14, ctx({ 0: [100, 30, 0] })); expect(s.trophies.awarded).toBe(1); expect(s.trophies.remaining).toBe(30);
  });
  test.each(['easy', 'limit', 'all-maxed', 'class-can-level', 'locked-class'] as const)('Trophy eligibility: %s', policy => {
    const s = fixture(); s.classLevels.fill(10); special(s, 14, 'BOSS', { matched: true });
    if (policy === 'easy') { s.difficulty = Difficulty.DIFF_EASY; s.trophies.remaining = 3; }
    if (policy === 'limit') s.trophies.awarded = 3;
    if (policy === 'class-can-level') { s.character.classId = 1; s.classLevels[1] = 9; }
    if (policy === 'locked-class') s.classLevels[2] = 0;
    const c = ctx(); specialRewards(s, 14, c);
    expect(s.board[14]!.type === TileType.TILE_SPECIAL).toBe(policy === 'class-can-level' || policy === 'locked-class');
    if (policy === 'easy') expect(s.trophies.remaining).toBe(3);
    if (['easy', 'limit', 'all-maxed'].includes(policy)) expect(c.rng.calls.some(v => v.lane === 0)).toBe(false);
  });
  test('Trophy intervals count special kills, cap at three, promoted-by-skill achievement', () => {
    const s = fixture(); s.trophies.remaining = 2; special(s, 14, 'BOSS', { matched: true }); specialRewards(s, 14, ctx()); expect(s.trophies.remaining).toBe(1); expect(s.trophies.awarded).toBe(0);
    special(s, 15, 'BOSS', { matched: true, promotedBySkill: true }); specialRewards(s, 15, ctx()); expect(s.trophies.awarded).toBe(1); expect(s.trophies.remaining).toBe(20);
    expect(s.achievementQueue).toContainEqual({ id: 0x42, progress: 100 });
  });
  test('Healer reward source board[0] potion variants are inherited, including hidden mana tokens', () => {
    const s = fixture(); s.classLevels.fill(10); tile(s, 0, potion, { mana: true }); special(s, 14, 'HEALER', { matched: true });
    const c = ctx(); specialRewards(s, 14, c); expect(s.pending).toEqual([]); expect(c.rng.cosmetic).toBe(0);
    tile(s, 0, potion, { acid: true }); specialRewards(s, 14, ctx()); expect(s.pending).toHaveLength(15); expect(s.pending.every(e => e.kind === 'resource' && e.variant === 2)).toBe(true);
  });
  test('Changeling kill fully charges a randomly chosen existing skill; no equipment menu needed', () => {
    const s = fixture(); race(s, 'CHANGELING'); s.classLevels.fill(10);
    s.skills[0] = { id: 0, level: 1, charge: 3, cooldown: 8, active: false }; s.skills[1] = { id: 1, level: 1, charge: 0, cooldown: 6, active: false }; s.selectedSkillCount = 2;
    special(s, 14, 'BOSS', { matched: true }); specialRewards(s, 14, ctx({ 5: [1] }));
    expect(s.skills[0]!.charge).toBe(3); expect(s.skills[1]!.charge).toBe(6); expect(s.achievementQueue).toContainEqual({ id: 0x37, progress: 2 });
  });
});

describe('Devourer minimal equipment integration — 0x2ecb8/0x4dbe0/0x5193c/0x26c94', () => {
  test('empty selected equipment does not reroll; countdown resets and one OTHER draw', () => {
    const s = sealed('DEVOURER'); s.equipment[0].stats.fill(0); s.board[14]!.countdown = 1; const before = structuredClone(s.equipment); const c = act(s);
    expect(s.equipment).toEqual(before); expect(c.rng.calls).toEqual([{ a: 0, b: 4, lane: 5 }]); expect(s.board[14]!.countdown).toBe(5);
  });
  test.each([[17, 5], [18, 3], [22, 3], [23, 2]])('leech total %s downgrade=%s', (total, step) => {
    const s = fixture(); s.equipmentStats.leechPercent = total!; expect(downgradeStep(s, upgradeId('leechPercent'))).toBe(step);
  });
  test.each([[74, 10], [75, 5], [82, 5], [83, 3], [87, 3], [88, 2]])('durability %s downgrade=%s', (total, step) => {
    const s = fixture(); s.equipmentStats.breakThreshold = 100 - total!; expect(downgradeStep(s, upgradeId('durabilityPercent'))).toBe(step);
  });
  test('Faithful regeneration step=2, Pretzel health step=0', () => {
    const s = fixture(); s.character.perks[0] = enumValue('PerkType', 'PERK_FAITHFUL'); expect(downgradeStep(s, upgradeId('regeneration'))).toBe(2);
    s.challenge = true; s.mode = GameMode.MODE_PRETZEL; expect(downgradeStep(s, upgradeId('maxHealth'))).toBe(0);
  });
  test('Quicken destroyed raises cooldown, preserves existing charge', () => {
    const s = sealed('DEVOURER'); s.equipment[0].stats.fill(0); s.equipment[0].stats[upgradeId('cooldownFlag')] = 1;
    s.skills[0] = { id: 0, level: 1, charge: 3, cooldown: 8, active: false }; s.selectedSkillCount = 1; updateEquipmentStats(s); expect(s.skills[0]!.cooldown).toBe(7);
    s.board[14]!.countdown = 1; act(s); expect(s.skills[0]).toMatchObject({ cooldown: 8, charge: 3 });
  });
  test('recompute all equipment-derived fields, caps, float bonuses and damage deficits', () => {
    const s = fixture(); s.equipment.forEach(i => i.stats.fill(0));
    const values: Record<string, number> = { weaponDamage: 5, baseDamage: 2, strength: 3, dexterity: 4, vitality: 2, luck: 5, maxHealth: 10, armour: 8, piercePercent: 100, durabilityPercent: 100, poisonDamage: 3, leechPercent: 12, spikes: 2, weakenAttack: 4, regeneration: 3, repair: 2, xpQuarterBonus: 9, goldQuarterBonus: 3, upgradeQuarterBonus: 2 };
    for (const [key, value] of Object.entries(values)) s.equipment[0].stats[upgradeId(key)] = value;
    s.health = 20; s.armour = 1; updateEquipmentStats(s);
    expect(s.equipmentStats).toMatchObject({ weaponDamage: 5, damage: 5, maxHealth: 20, maxArmour: 8, healing: 5, repair: 6, pierceThreshold: 95, breakThreshold: 5, poison: 3, leechPercent: 12, spikes: 2, weaken: 4, regeneration: 3, bonusToken: { xp: 15, shield: 20, potion: 10, coin: 25 } });
    expect([s.resources.xp.bonus, s.resources.gold.bonus, s.resources.upgrade.bonus]).toEqual([2, .75, .5]); expect(s.health).toBe(30); expect(s.armour).toBe(5);
  });
});

test('Fleeing death during ProcessAttack spike refill cannot be overwritten by AdvancePhase', () => {
  const s = fixture(); s.phase = 'enemy-attack'; s.health = 1; s.equipmentStats.spikes = 1;
  special(s, 24, 'FLEEING', { attack: 3 }); tile(s, 30, skull, { health: 1 });
  const result = step(s, { type: 'AdvancePhase' });
  expect(result.state.phase).toBe('ended'); expect(result.state.outcome?.cause).toBe('fleeing');
  expect(result.state.pending).toEqual([]); expect(result.state.moving).toEqual([]); expect(result.state.resumePhase).toBeNull();
  expect(result.events.filter(e => e.type === 'GameOver')).toHaveLength(1);
});
