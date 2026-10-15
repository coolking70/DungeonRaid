import { describe, expect, it } from 'vitest';
import { classData, Difficulty, enumValue, GameMode, itemData, TileType } from '../src/core/data';
import { step, type Action } from '../src/core/engine';
import { createRunState } from '../src/core/state';
import { type RngCall } from '../src/core/rng';

const action = (seed = 12345, classId = 0, difficulty = Difficulty.DIFF_NORMAL, mode = GameMode.MODE_CLASSIC): Action => ({ type: 'NewGame', seed, classId, difficulty, mode });
// Independent reference: BigInt uint32, float32 range formula, explicit six-lane flush.
function initialReference(seed: number) {
  const advance = (n: number) => Number((BigInt(n) * 16807n) & 0xffffffffn);
  let cosmetic = advance(seed), tile = advance(seed), tileCalls = 0;
  const types: number[] = [], appearances: number[] = [], trace: [number, [number, number]][] = [];
  for (let i = 0; i < 36; i++) {
    let type: number;
    do {
      tile = advance(tile); tileCalls++; trace.push([1, [0, 4]]);
      type = Math.floor(Math.fround(Math.fround(5 * ((tile >>> 10) / 4194304))));
    } while (type === 1);
    types.push(type);
    cosmetic = advance(cosmetic); trace.push([0, [0, 7]]);
    appearances.push(Math.floor(Math.fround(8 * ((cosmetic >>> 10) / 4194304))));
  }
  return { types, appearances, cosmetic, tile, tileCalls, trace };
}
describe('[01-board InitNewGame / 04 初装 / 05 职业模式]', () => {
  it.each([0, 1, 12345, 0x7fffffff, 0xffffffff])('matches independently computed board, RNG counts and state for seed %s', seed => {
    const calls: RngCall[] = [];
    const { state } = step(createRunState(), action(seed), { rng: c => calls.push(c) });
    const expected = initialReference(seed);
    expect(state.board.map(t => t.type)).toEqual(expected.types);
    expect(state.board.map(t => t.appearance)).toEqual(expected.appearances);
    expect(state.rng.seeds.slice(0, 2)).toEqual([expected.cosmetic, expected.tile]);
    const draws = calls.filter(c => c.operation !== 'FlushRandSeeds');
    expect(draws.filter(c => c.lane === 0)).toHaveLength(36);
    expect(draws.filter(c => c.lane === 1)).toHaveLength(expected.tileCalls);
    expect(draws.filter(c => c.lane === 2)).toHaveLength(10); // icon + noun per initial item
    expect(draws.filter(c => c.lane < 2).map(c => [c.lane, c.range])).toEqual(expected.trace);
    expect(calls.slice(0, 6).map(c => c.lane)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(state.rng.calls).toBe(6 + 36 + expected.tileCalls + 10);
    expect(state.board).toHaveLength(36);
    expect(state.board.every(t => t.type !== TileType.TILE_NONE && t.type !== TileType.TILE_SKULL && !t.matched && !t.newThisTurn)).toBe(true);
    const counts = [0, 2, 3, 4].map(type => state.board.filter(t => t.type === type).length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(36);
    expect(counts).toEqual([0, 2, 3, 4].map(type => expected.types.filter(t => t === type).length));
  });
  it('same seed gives identical full state/events; different seeds give different boards', () => {
    const original = createRunState(), before = structuredClone(original);
    const a = step(original, action()), b = step(original, action()), c = step(original, action(98765));
    expect(a).toEqual(b); expect(c.state.board).not.toEqual(a.state.board); expect(original).toEqual(before);
    a.state.board[0]!.poison[0] = 99; expect(original.board[0]!.poison[0]).toBe(0); expect(b.state.board[0]!.poison[0]).toBe(0);
  });
  it('resets dirty run state completely and retains explicit compatibility options', () => {
    const input = createRunState({ arrivalOrder: 'reject-ambiguous' });
    input.turn = 777; input.playerPoison = 9; input.chain.nodes.push(4); input.current.forceCoin = true; input.resources.xp.carry = 0.75;
    const output = step(input, action()).state;
    expect(output).toEqual(step(createRunState({ arrivalOrder: 'reject-ambiguous' }), action()).state);
    expect(input.turn).toBe(777); expect(output.phase).toBe('input'); expect(output.inputReady).toBe(true);
  });
  it('initial ordinary stats are B3/W2, HP50, armour4 and attributes1 without double conversion', () => {
    const { state } = step(createRunState(), action());
    expect(state.base).toMatchObject({ damage: 3, maxHealth: 40, strength: 1, dexterity: 1, vitality: 1, luck: 1, healing: 1, repair: 1 });
    expect(state.equipmentStats).toMatchObject({ damage: 0, weaponDamage: 2, maxHealth: 10, maxArmour: 4, strength: 0, pierceThreshold: 50, breakThreshold: 50 });
    expect(state.health).toBe(50); expect(state.armour).toBe(4);
    expect(state.level).toBe(1); expect(state.skills).toEqual([null, null, null, null]);
    expect(state.resources).toEqual({ xp: { remainder: 0, banked: 0, carry: 0, bonus: 0 }, gold: { remainder: 0, banked: 0, carry: 0, bonus: 0 }, upgrade: { remainder: 0, banked: 0, carry: 0, bonus: 0 } });
    state.equipment.forEach((item, i) => {
      const slot = itemData.slots[i]!;
      expect(item.stats).toEqual(slot.initialStats); expect(item.icon).toBeGreaterThanOrEqual(slot.iconRangeInclusive[0]!); expect(item.icon).toBeLessThanOrEqual(slot.iconRangeInclusive[1]!);
      const mapping = itemData.nameMappings.find(m => item.icon >= m.iconStart && item.icon < m.iconEndExclusive)!;
      expect(item.suffixIndex).toBeGreaterThanOrEqual(0); expect(item.suffixIndex).toBeLessThan(itemData.names[mapping.pool as keyof typeof itemData.names].length);
      expect(item.prefixAnchor).toBe(-1); expect(item.displayPrefix).toBe(-1);
    });
  });
  it.each(classData.classes.map(c => [c.class.value, c.class.name] as const))('starts class %s %s with table configuration and no free skill', (id) => {
    const { state } = step(createRunState(), action(12345, id));
    const data = classData.classes[id]!;
    expect(state.character.race).toBe(data.defaultRace.value);
    expect(state.character.perks[0]).toBe(data.defaultPerk.value); expect(state.character.flaws[0]).toBe(data.defaultFlaw.value);
    expect(state.character.replacementSkills).toEqual(data.baseSkillVector.map(s => s.value));
    expect(state.skills).toEqual([null, null, null, null]); expect(state.selectedSkillCount).toBe(0);
    const hasPerk = (name: string) => data.defaultPerk.value === enumValue('PerkType', name);
    const hasFlaw = (name: string) => data.defaultFlaw.value === enumValue('FlawType', name);
    expect(state.health).toBe(50 + (hasPerk('PERK_TOUGH') ? 10 : 0) - (hasFlaw('FLAW_FRAIL') ? 10 : 0));
    expect(state.armour).toBe(hasFlaw('FLAW_SLIM') ? 3 : 4);
    expect(state.base.damage).toBe(hasPerk('PERK_STRONG') ? 4 : 3);
    expect(state.base.bonusToken.coin).toBe(hasPerk('PERK_FRUGAL') ? 30 : 20);
    expect(state.base.bonusToken.shield).toBe(hasFlaw('FLAW_RECKLESS') ? 10 : 20);
    expect(state.promotion.remaining).toBe(hasFlaw('FLAW_ZEALOUS') ? 49 : 50);
    expect(state.equipmentStats.pierceThreshold).toBe(hasFlaw('FLAW_CAUTIOUS') ? 30 : 50);
  });
  it.each([Difficulty.DIFF_EASY, Difficulty.DIFF_NORMAL, Difficulty.DIFF_HARD, Difficulty.DIFF_HARDER])('mode and difficulty are independent at difficulty %s', difficulty => {
    const sprint = step(createRunState(), action(12345, 0, difficulty, GameMode.MODE_SPRINT)).state;
    const pretzel = step(createRunState(), action(12345, 0, difficulty, GameMode.MODE_PRETZEL)).state;
    expect(sprint.challenge).toBe(true); expect(sprint.difficulty).toBe(difficulty); expect(sprint.promotion.remaining).toBe(200); expect(sprint.health).toBe(50);
    expect(pretzel.challenge).toBe(true); expect(pretzel.difficulty).toBe(difficulty); expect(pretzel.health).toBe(100); expect(pretzel.equipment[4].stats[10]).toBe(0);
  });
  it('B1 alternate initial filter allows skulls, excludes swords and reports B2 draw substitution', () => {
    const { state, events } = step(createRunState({ initialFilter: 'exclude-swords' }), action());
    expect(state.board.some(t => t.type === TileType.TILE_SKULL)).toBe(true); expect(state.board.every(t => t.type !== TileType.TILE_SWORD)).toBe(true);
    expect(state.diagnostics.some(d => d.startsWith('B2:'))).toBe(true); expect(events.some(e => e.type === 'CompatibilityNotice')).toBe(true);
    const strict = createRunState({ initialFilter: 'exclude-swords', zeroTurnPromotion: 'reject' }); const before = structuredClone(strict);
    expect(() => step(strict, action())).toThrow('B2'); expect(strict).toEqual(before);
  });
  it.each([
    { type: 'CastSkill', slot: 0, source: 'manual' }, { type: 'SelectMenuItem', menuId: 1, index: 0 },
    { type: 'ClaimTrophy', slot: 0 },
  ] satisfies Action[])('rejects growth actions in idle state without mutation', action => {
    const input = createRunState(), before = structuredClone(input);
    expect(() => step(input, action)).toThrow(Error); expect(input).toEqual(before);
  });
  it('rejects invalid class, difficulty, mode and seed instead of creating partial games', () => {
    const state = createRunState();
    expect(() => step(state, action(1, 10))).toThrow('class'); expect(() => step(state, action(1, 0, 4))).toThrow('difficulty');
    expect(() => step(state, action(1, 0, 1, 2))).toThrow('mode'); expect(() => step(state, action(NaN))).toThrow('Seed');
  });
});
