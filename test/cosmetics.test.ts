import { expect, test } from 'vitest';
import { attackSkull, matchTile, processAttack, resourceToken } from '../src/core/combat';
import { flareDraw, flightDraw, labelDraw, particleDraws, tokenDraws } from '../src/core/cosmetics';
import { RandType, TileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { createRngState, NativeRng, type RngCall } from '../src/core/rng';
import { context, fixture, select, tile } from './turn-helpers';

function seedAfter(seed: number, count: number): number {
  let s = BigInt(seed); for (let i = 0; i < count; i++) s = (s * 16807n) & 0xffffffffn;
  return Number(s);
}
test.each([['shatter', 33], ['sparks', 81]] as const)('native %s geometry draws preserve exactly %i COSMETIC transitions', (kind, count) => {
  const state = createRngState(), calls: RngCall[] = []; const rng = new NativeRng(state, c => calls.push({ ...c }));
  rng.setRandSeed(12345, 0); particleDraws(rng, kind);
  expect(state.seeds[0]).toBe(seedAfter(12345, count)); expect(state.calls).toBe(count);
  expect(calls.every(c => c.lane === RandType.RAND_COSMETIC)).toBe(true);
  expect(state.seeds.slice(1)).toEqual([0, 0, 0, 0, 0]);
});
test('Token ranges and label exception branches come from native floats; all use lane0', () => {
  const state = createRngState(), calls: RngCall[] = []; const rng = new NativeRng(state, c => calls.push({ ...c }));
  tokenDraws(rng, true); expect(calls.map(c => c.range)).toEqual([[-.1, .1], [-.1, .1], [6, 7], [1, 1.35], [4, 6]]);
  for (const kind of [1, 3, 8, 9, 10]) labelDraw(rng, kind); expect(calls).toHaveLength(5);
  labelDraw(rng, 7); flareDraw(rng); flightDraw(rng); flightDraw(rng, true);
  expect(calls.slice(5).map(c => c.range)).toEqual([[.1, .2], [0, 360], [.4, .8], [.4, 1]]);
  expect(calls.every(c => c.lane === 0)).toBe(true);
});
test('ordinary kill retains33 shatter+5 XP draws; no armour/poison gameplay draws after kill', () => {
  const s = fixture(); s.equipmentStats.poison = 2; tile(s, 0, TileType.TILE_SKULL, { health: 1 }); const c = context();
  attackSkull(s, 0, 1, true, c); expect(c.rng.calls).toEqual([]); expect(c.rng.cosmeticCalls).toBe(38);
});
test('normal coin4 draws, bonus coin4 then label1; no-target mana skips all token draws', () => {
  const s = fixture(), c = context([20]); matchTile(s, 0, c); expect(c.rng.cosmeticCalls).toBe(4);
  s.collectedByType[TileType.TILE_COIN] = 3; matchTile(s, 1, c); expect(c.rng.cosmeticCalls).toBe(13);
  resourceToken(s, TileType.TILE_POTION, 2, c, 1); expect(c.rng.cosmeticCalls).toBe(13);
});
test('HP sparks precede pierce rolls, armour sparks follow rolls, poison label is last', () => {
  const s = fixture(); s.equipmentStats.pierceThreshold = 101; s.equipmentStats.poison = 2;
  tile(s, 0, TileType.TILE_SKULL, { health: 20, defence: 2 }); const trace: number[] = [];
  attackSkull(s, 0, 3, true, { rng: new NativeRng(s.rng, call => trace.push(call.lane)), events: [] });
  expect(trace).toEqual([...Array<number>(81).fill(0), 5, 5, ...Array<number>(82).fill(0)]);
});
test('full combat commit consumes38 kill draws before3 refill appearances and final leech-flight draw even at0% leech', () => {
  const s = fixture(); tile(s, 0, TileType.TILE_SWORD); tile(s, 1, TileType.TILE_SWORD); tile(s, 2, TileType.TILE_SKULL, { health: 1 });
  const trace: RngCall[] = [];
  step(select(s, [0, 1, 2]), { type: 'CommitChain' }, { rng: c => trace.push({ ...c }) });
  expect(trace.slice(0, 38).every(c => c.lane === 0)).toBe(true);
  expect(trace.filter(c => c.lane === 0)).toHaveLength(42); expect(trace.at(-1)).toMatchObject({ lane: 0, operation: 'Rand', range: [.4, .8] });
});
test('ProcessAttack eyes, both flights, block and HP labels retain native draw count', () => {
  const s = fixture(); s.armour = 5; tile(s, 0, TileType.TILE_SKULL, { attack: 3 }); tile(s, 1, TileType.TILE_SKULL, { attack: 5 });
  const c = context([100, 100, 100, 100, 100]); processAttack(s, c);
  expect(c.rng.cosmeticCalls).toBe(8); expect(c.rng.calls).toHaveLength(5);
});

test('explosive potion collects seven neighbouring resources, leaves skull, and retains nine flare draws', () => {
  const s = fixture(); tile(s, 7, TileType.TILE_POTION, { explosive: true }); tile(s, 8, TileType.TILE_SKULL);
  const c = context([100, 100, 100, 100]); matchTile(s, 7, c);
  expect(s.pending).toHaveLength(7); expect(s.board[8]!.matched).toBe(false); expect(s.board[8]!.health).toBe(20);
  expect(c.rng.calls).toHaveLength(4); expect(c.rng.cosmeticCalls).toBe(7 * 4 + 9);
});
