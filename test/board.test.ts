import { describe, expect, it } from 'vitest';
import { Difficulty, enumValue, GameMode, RandType, TileType } from '../src/core/data';
import { generateStats, initialiseBoard, initialisePromotion, isTimeToPromote, moveMatchedTiles, randomiseTile, refillOrder, rowMajor, setTileType, setTimeToPromotion, slotIndex, tileAt, type BoardEvent } from '../src/core/board';
import { createRunState, defaultCharacter, type RunState } from '../src/core/state';
import { NativeRng, type RandomSource, type RngCall } from '../src/core/rng';

class ScriptedRng implements RandomSource {
  calls: { kind: string; lane: RandType; range: [number, number] }[] = [];
  constructor(private values: number[] = []) {}
  randI(a: number, b: number, lane: RandType): number {
    this.calls.push({ kind: 'RandI', lane, range: [a, b] });
    const value = this.values.shift() ?? Math.min(a, b);
    if (value < Math.min(a, b) || value > Math.max(a, b)) throw new Error(`Invalid scripted ${value} in ${a}..${b}`);
    return value;
  }
  rand(a: number, b: number, lane: RandType): number { this.calls.push({ kind: 'Rand', lane, range: [a, b] }); return a; }
  randUnitF(lane: RandType): number { this.calls.push({ kind: 'RandUnitF', lane, range: [0, 1] }); return 0; }
}
const fresh = (): RunState => { const state = createRunState(); state.turn = 100; initialisePromotion(state); return state; };
const putPerk = (state: RunState, name: string): void => { state.character.perks[0] = enumValue('PerkType', name); };
const putFlaw = (state: RunState, name: string): void => { state.character.flaws[0] = enumValue('FlawType', name); };

describe('[01-board 坐标、普通格生成]', () => {
  it('traverses row-major initially and column-major bottom-up during refill', () => {
    expect([...rowMajor()].slice(0, 7)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 1 }]);
    expect([...refillOrder()].slice(0, 7)).toEqual([{ x: 0, y: 5 }, { x: 0, y: 4 }, { x: 0, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 5 }]);
    expect(slotIndex(5, 5)).toBe(35); expect(() => slotIndex(-1, 0)).toThrow(); expect(() => slotIndex(0, 6)).toThrow(); expect(() => slotIndex(0.5, 0)).toThrow();
  });
  it.each([0, 1, 2, 3, 4])('uses full equal-weight 0..4 range for type %s', type => {
    const state = fresh(), rng = new ScriptedRng([type, 7]);
    randomiseTile(state, state.board[0]!, rng);
    expect(rng.calls[0]).toEqual({ kind: 'RandI', lane: RandType.RAND_TILE, range: [0, 4] });
    expect(rng.calls[1]).toEqual({ kind: 'RandI', lane: RandType.RAND_COSMETIC, range: [0, 7] });
    expect(state.board[0]!.type).toBe(type); expect(state.board[0]!.appearance).toBe(7);
    expect(state.generated).toEqual({ total: 1, skulls: type === 1 ? 1 : 0 });
  });
  it.each([false, true])('filter retries the full range (excludeSwords=%s)', excludeSwords => {
    const state = fresh(), excluded = excludeSwords ? 4 : 1;
    state.filter = { enabled: true, excludeSwords };
    const rng = new ScriptedRng([excluded, excluded, 2, 0]);
    randomiseTile(state, state.board[0]!, rng);
    expect(rng.calls.map(call => [call.lane, call.range])).toEqual([[1, [0, 4]], [1, [0, 4]], [1, [0, 4]], [0, [0, 7]]]);
    expect(state.board[0]!.type).toBe(2);
  });
  it.each([
    ['PERK_GIFTED', null, 0, 'mana', 5, true], ['PERK_GIFTED', null, 0, 'mana', 6, false],
    ['PERK_AGILE', null, 4, 'arrow', 5, true], ['PERK_AGILE', null, 4, 'arrow', 6, false],
    [null, 'FLAW_CLUMSY', 3, 'broken', 3, true], [null, 'FLAW_CLUMSY', 3, 'broken', 4, false],
  ] as const)('applies conditional variant %s/%s on type%s at threshold %s=%s', (perk, flaw, type, flag, value, expected) => {
    const state = fresh(); if (perk) putPerk(state, perk); if (flaw) putFlaw(state, flaw);
    const rng = new ScriptedRng([type, 0, value]); randomiseTile(state, state.board[0]!, rng);
    expect(state.board[0]![flag]).toBe(expected);
    expect(rng.calls.map(call => [call.lane, call.range])).toEqual([[1, [0, 4]], [0, [0, 7]], [1, [1, 100]]]);
  });
  it('does not draw a conditional roll for other types', () => {
    const state = fresh(); putPerk(state, 'PERK_GIFTED'); putFlaw(state, 'FLAW_CLUMSY');
    const rng = new ScriptedRng([2, 0]); randomiseTile(state, state.board[0]!, rng); expect(rng.calls).toHaveLength(2);
  });
  it('[P10] forceCoin skips type draw, but CollectBoard and filter override it', () => {
    for (const exception of ['none', 'collect', 'filter']) {
      const state = fresh(); state.current.forceCoin = true; state.collectingBoard = exception === 'collect'; state.filter.enabled = exception === 'filter';
      const rng = new ScriptedRng(); randomiseTile(state, state.board[0]!, rng);
      expect(rng.calls.map(c => c.lane)).toEqual(exception === 'none' ? [0] : [1, 0]);
      expect(state.board[0]!.type).toBe(exception === 'none' ? 2 : 0);
    }
  });
  it('Trap changes current HP only; ordinary max HP remains generated', () => {
    const state = fresh(); state.current.oneHealthSkulls = true;
    randomiseTile(state, state.board[0]!, new ScriptedRng([1, 0]));
    expect(state.board[0]!.health).toBe(1); expect(state.board[0]!.maxHealth).toBe(5);
  });
  it('SetType clears variants/status while retaining slot, matched and new flags', () => {
    const state = fresh(), tile = state.board[0]!;
    Object.assign(tile, { type: 1, selected: true, matched: true, newThisTurn: true, poison: [3, 4, 5], arrow: true, frozen: true, burning: true, broken: true, abilityUsed: true });
    setTileType(state, tile, TileType.TILE_COIN, new ScriptedRng());
    expect(tile).toMatchObject({ x: 0, y: 0, matched: true, newThisTurn: true, selected: false, arrow: false, frozen: false, burning: false, broken: false, abilityUsed: false, poison: [0, 0, 0], specialType: 3 });
  });
  it('initial fill emits 36 row-major slots and clears both filters', () => {
    const state = fresh(), events: BoardEvent[] = []; initialiseBoard(state, new ScriptedRng(), events);
    expect(events.filter(e => e.type === 'TileGenerated').map(e => e.slot)).toEqual(Array.from({ length: 36 }, (_, i) => i));
    expect(state.filter).toEqual({ enabled: false, excludeSwords: false });
  });
});

describe('[01-board 普通骷髅 GenerateStats]', () => {
  it.each([
    [0, [[1, 1], [1, 1], [4, 5], [20, 30]], [1, 1, 4], 25],
    [1, [[1, 1], [2, 2], [5, 6], [20, 30]], [1, 2, 5], 20],
    [2, [[2, 2], [2, 2], [5, 8], [15, 30]], [2, 2, 5], 15],
    [3, [[2, 2], [3, 2], [6, 10], [15, 30]], [2, 2, 6], 15],
  ] as const)('difficulty %s draws A,D,H,C in order including reversed defence bounds', (difficulty, ranges, stats, candidate) => {
    const state = fresh(); state.difficulty = difficulty;
    const rng = new ScriptedRng(), tile = state.board[0]!;
    expect(generateStats(state, tile, rng)).toBe(candidate);
    expect(rng.calls.map(c => c.range)).toEqual(ranges); expect(rng.calls.every(c => c.lane === RandType.RAND_TILE)).toBe(true);
    expect([tile.attack, tile.defence, tile.health]).toEqual(stats); expect(tile.maxHealth).toBe(tile.health);
    expect(state.promotion.remaining).toBe(50); // ordinary candidate is consumed and discarded
  });
  it.each([0, 1, 2, 3])('zero-turn difficulty %s preserves four draws without inventing C', difficulty => {
    const state = fresh(); state.turn = 0; state.difficulty = difficulty;
    const rng = new ScriptedRng(); expect(generateStats(state, state.board[0]!, rng)).toBeNull();
    expect(rng.calls.map(c => c.kind)).toEqual(['RandI', 'RandI', 'RandI', 'RandUnitF']);
    expect(state.board[0]).toMatchObject({ attack: 1, defence: 0, health: difficulty === 0 ? 3 : 4 });
    expect(state.diagnostics[0]).toContain('B2'); expect(state.promotion.remaining).toBe(50);
  });
  it('B2 strict mode rejects before drawing; no fabricated interval for zero-turn special', () => {
    const state = fresh(); state.turn = 0; state.options.zeroTurnPromotion = 'reject'; const rng = new ScriptedRng();
    expect(() => generateStats(state, state.board[0]!, rng)).toThrow('B2'); expect(rng.calls).toHaveLength(0);
    state.options.zeroTurnPromotion = 'consume-unit-and-defer'; state.board[0]!.enemyType = 1;
    expect(() => generateStats(state, state.board[0]!, rng)).toThrow('B2');
  });
  it('Sprint retains normal difficulty draws before its three overriding draws', () => {
    const state = fresh(); state.challenge = true; state.mode = GameMode.MODE_SPRINT;
    const rng = new ScriptedRng(); generateStats(state, state.board[0]!, rng);
    expect(rng.calls.map(c => c.range)).toEqual([[1, 1], [2, 2], [5, 6], [20, 30], [5, 8], [10, 16], [12, 25]]);
    expect(state.board[0]).toMatchObject({ attack: 5, defence: 10, health: 12, maxHealth: 12 });
  });
  it('Pretzel forces the normal curve while preserving selected difficulty', () => {
    const state = fresh(); state.challenge = true; state.mode = GameMode.MODE_PRETZEL; state.difficulty = Difficulty.DIFF_HARDER;
    const rng = new ScriptedRng(); generateStats(state, state.board[0]!, rng);
    expect(rng.calls.map(c => c.range)).toEqual([[1, 1], [2, 2], [5, 6], [20, 30]]); expect(state.difficulty).toBe(3);
  });
  it.each([false, true])('uses float32 acceleration/XP scaling and Sprint XP division=%s', sprint => {
    const state = fresh(); state.turn = 12345; state.resources.xp.banked = 640000; state.resources.xp.remainder = 73;
    state.challenge = sprint; state.mode = sprint ? GameMode.MODE_SPRINT : GameMode.MODE_CLASSIC;
    const f = Math.fround;
    const level = Math.trunc((sprint ? Math.trunc(640073 / 4) : 640073) / 100);
    let q = Math.trunc(f(f(12345) * Math.max(1, f(1 + f(f(12345 - 500) / f(700))))));
    q = Math.trunc(f(f(q) * f(1 + f(f(level - 40) / f(60)))));
    const rng = new ScriptedRng(); generateStats(state, state.board[0]!, rng);
    expect(rng.calls[0]!.range).toEqual([Math.trunc(q / 65), Math.trunc(q / 55)]);
    expect(rng.calls[3]!.range).toEqual([Math.trunc(f(f(200) / f(Math.sqrt(f(q))))), Math.trunc(f(f(300) / f(Math.sqrt(f(q)))))]);
  });
  it('Sneaky adds HP only for ordinary enemies; Invisible nemesis doubles generated ordinary defence even if marked', () => {
    const state = fresh(); putFlaw(state, 'FLAW_SNEAKY'); state.character.race = enumValue('RaceType', 'RACE_HALFLING');
    Object.assign(state.board[1]!, { type: 1, enemyType: enumValue('EnemyType', 'ENEMY_INVISIBLE'), matched: true });
    generateStats(state, state.board[0]!, new ScriptedRng()); expect(state.board[0]).toMatchObject({ health: 6, maxHealth: 6, defence: 4 });
    state.board[0]!.enemyType = 1; generateStats(state, state.board[0]!, new ScriptedRng());
    expect(state.board[0]!.health).toBe(5); expect(state.board[0]!.statsStatus).toBe('special-pending');
  });
});

describe('[01-board 晋升计时与T05边界]', () => {
  it.each([[false, false, 50], [false, true, 49], [true, false, 200], [true, true, 200]] as const)('initial countdown Sprint=%s Zealous=%s', (sprint, zealous, expected) => {
    const state = fresh(); state.challenge = sprint; state.mode = sprint ? GameMode.MODE_SPRINT : GameMode.MODE_CLASSIC;
    if (zealous) putFlaw(state, 'FLAW_ZEALOUS'); initialisePromotion(state); expect(state.promotion.remaining).toBe(expected);
  });
  it.each([0, 1, 2, 50])('classic triggers only at zero, P=%s', remaining => {
    const state = fresh(); state.promotion.remaining = remaining; expect(isTimeToPromote(state)).toBe(remaining === 0);
  });
  it.each([false, true])('Sprint sentinel, zero, periodic checks, reset permission (Zealous=%s)', zealous => {
    const state = fresh(); state.challenge = true; state.mode = GameMode.MODE_SPRINT;
    if (zealous) putFlaw(state, 'FLAW_ZEALOUS'); state.turn = zealous ? 12 : 14;
    state.promotion.remaining = 200; expect(isTimeToPromote(state)).toBe(false);
    state.promotion.remaining = 199; expect(isTimeToPromote(state)).toBe(true); expect(state.promotion.remaining).toBe(0);
    expect(isTimeToPromote(state)).toBe(true); setTimeToPromotion(state, 17); expect(state.promotion.remaining).toBe(200);
    state.promotion.remaining = 10; state.turn++; expect(isTimeToPromote(state)).toBe(false);
    state.promotion.allowReset = false; setTimeToPromotion(state, 9); expect(state.promotion.remaining).toBe(10);
  });
  it('classic expiry waits for a skull, then emits a visibly incomplete special placeholder', () => {
    const state = fresh(), events: BoardEvent[] = []; state.promotion.remaining = 0;
    randomiseTile(state, state.board[0]!, new ScriptedRng([2, 0]), events); expect(state.promotion.remaining).toBe(0);
    const rng = new ScriptedRng([1, 0, 1]); randomiseTile(state, state.board[1]!, rng, events);
    expect(rng.calls.map(c => c.range)).toEqual([[0, 4], [0, 7], [1, 32], [1, 1], [2, 2], [5, 6], [20, 30]]);
    expect(state.promotion.remaining).toBe(20); expect(state.board[1]!.statsStatus).toBe('special-pending');
    expect(events).toContainEqual({ type: 'SpecialEnemyPending', slot: 1, enemyType: 1, promotionCandidate: 20 });
  });
  it('Sprint forces a skull before filtering and resets the sentinel after promotion', () => {
    const state = fresh(); state.challenge = true; state.mode = GameMode.MODE_SPRINT; state.turn = 14; state.promotion.remaining = 199;
    randomiseTile(state, state.board[0]!, new ScriptedRng([2, 0, 1]));
    expect(state.board[0]!.type).toBe(1); expect(state.promotion.remaining).toBe(200);
    state.promotion.remaining = 199; state.filter.enabled = true;
    const rng = new ScriptedRng([2, 2, 0]); randomiseTile(state, state.board[1]!, rng);
    expect(state.board[1]!.type).toBe(2); expect(state.promotion.remaining).toBe(0);
  });
  it.each([[false, 10, true], [false, 11, false], [true, 5, true], [true, 6, false]] as const)('non-Adventurer nemesis override Intimidating=%s roll=%s', (intimidating, roll, override) => {
    const state = fresh(); state.character = defaultCharacter(1); if (intimidating) putPerk(state, 'PERK_INTIMIDATING');
    state.promotion.remaining = 0;
    const rng = new ScriptedRng([1, 0, 1, roll]); randomiseTile(state, state.board[0]!, rng);
    expect(rng.calls[3]!.range).toEqual([1, 200]); expect(state.board[0]!.enemyType).toBe(override ? 9 : 1);
  });
  it('Zealous candidate is reduced, and reset suppression is respected', () => {
    const state = fresh(); putFlaw(state, 'FLAW_ZEALOUS'); state.promotion.remaining = 0;
    randomiseTile(state, state.board[0]!, new ScriptedRng([1, 0, 1])); expect(state.promotion.remaining).toBe(19);
    state.promotion.remaining = 0; state.promotion.allowReset = false;
    randomiseTile(state, state.board[1]!, new ScriptedRng([1, 0, 1])); expect(state.promotion.remaining).toBe(0);
  });
  it('T05 extension points preserve stats -> Trap -> spawn order and native moving-list visibility', () => {
    const state = fresh(); state.promotion.remaining = 0; state.current.oneHealthSkulls = true;
    state.board[0]!.matched = true;
    const order: string[] = [];
    moveMatchedTiles(state, new ScriptedRng([1, 0, 1]), [], {
      completeSpecialStats: (s, tile) => {
        expect(s.moving).toHaveLength(1);
        expect(tile.health).toBe(5);
        tile.maxHealth = tile.health = 30; tile.statsStatus = 'special'; order.push('stats');
      },
      specialSpawn: (s, tile) => {
        expect(tile.health).toBe(1); expect(tile.maxHealth).toBe(30);
        expect(s.generated.skulls).toBe(1); order.push('spawn');
      },
    });
    expect(order).toEqual(['stats', 'spawn']);
  });
});

describe('[01-board 下落与补充]', () => {
  it('moves complete state in stable vertical order and preserves fixed-slot object identity', () => {
    const state = fresh(); state.current.forceCoin = true;
    for (const tile of state.board) { tile.type = 2; tile.appearance = tile.y; }
    Object.assign(tileAt(state, 0, 0), { type: 1, attack: 13, defence: 7, health: 21, maxHealth: 31, poison: [2, 3, 4], frozen: true, countdown: 9, newThisTurn: false });
    for (const y of [1, 3, 5]) tileAt(state, 0, y).matched = true;
    const references = [...state.board], original = { ...tileAt(state, 0, 0) }, otherColumn = structuredClone(state.board.filter(t => t.x === 1));
    moveMatchedTiles(state, new ScriptedRng());
    expect(tileAt(state, 0, 3)).toEqual({ ...original, y: 3 });
    expect([tileAt(state, 0, 3).appearance, tileAt(state, 0, 4).appearance, tileAt(state, 0, 5).appearance]).toEqual([0, 2, 4]);
    expect(state.board.every((tile, i) => tile === references[i])).toBe(true);
    expect(state.board.filter(t => t.x === 1)).toEqual(otherColumn);
    expect(state.moving.filter(m => m.spawned).map(m => [m.from.y, m.to.y])).toEqual([[-1, 2], [-2, 1], [-3, 0]]);
    expect(state.board.filter(t => t.newThisTurn)).toHaveLength(3);
    expect(state.board.every(t => !t.matched)).toBe(true);
  });
  it('zero holes consumes no RNG; full board refill uses column order and new flags', () => {
    const state = fresh(), rng = new ScriptedRng(), events: BoardEvent[] = [];
    moveMatchedTiles(state, rng); expect(rng.calls).toHaveLength(0);
    state.board.forEach(t => { t.matched = true; }); moveMatchedTiles(state, rng, events);
    expect(events.filter(e => e.type === 'TileGenerated').map(e => e.slot)).toEqual([...refillOrder()].map(p => slotIndex(p.x, p.y)));
    expect(state.board.every(t => !t.matched && t.newThisTurn && t.type !== TileType.TILE_NONE)).toBe(true);
    expect(rng.calls).toHaveLength(72);
  });
  it('consecutive refills retain exact cross-lane draw order and continuing ordinals', () => {
    const state = fresh(); const calls: RngCall[] = []; const rng = new NativeRng(state.rng, c => calls.push(c));
    rng.setRandSeed(0, 6); // every generated tile is potion; isolates traversal from stats draws
    for (const round of [[[0, 5], [1, 4]], [[0, 2], [0, 5], [2, 1]]]) {
      for (const [x, y] of round) tileAt(state, x!, y!).matched = true;
      moveMatchedTiles(state, rng);
    }
    expect(calls.map(c => [c.index, c.lane, c.range])).toEqual(Array.from({ length: 5 }, (_, i) => [[2 * i + 1, 1, [0, 4]], [2 * i + 2, 0, [0, 7]]]).flat());
    expect(state.moving.filter(m => m.spawned).map(m => m.to)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 }]);
  });
  it('Fleeing descent is explicit T05 work; hook runs after all columns in slot order', () => {
    const state = fresh(); state.current.forceCoin = true;
    Object.assign(tileAt(state, 0, 4), { type: 1, enemyType: 31 }); tileAt(state, 0, 5).matched = true;
    Object.assign(tileAt(state, 1, 0), { type: 1, enemyType: 31 }); tileAt(state, 1, 1).matched = true;
    const rng = new ScriptedRng(); expect(() => moveMatchedTiles(state, rng)).toThrow('T05'); expect(rng.calls).toHaveLength(0);
    const called: number[] = []; moveMatchedTiles(state, rng, [], { fleeingFell: (s, slot) => { expect(s.board.every(t => !t.matched)).toBe(true); called.push(slot); } });
    expect(called).toEqual([7, 30]);
  });
});
