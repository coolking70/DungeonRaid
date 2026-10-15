import { describe, expect, it } from 'vitest';
import { ALL_RAND_TYPES, RandType } from '../src/core/data';
import { NativeRng, createRngState, type RngCall } from '../src/core/rng';

// Independent uint32 reference uses exact BigInt multiplication, not the production imul.
const advance = (seed: number): number => Number((BigInt(seed) * 16807n) & 0xffffffffn);
function inverseSeed(next: number): number {
  let [a, b, x, y] = [16807n, 1n << 32n, 1n, 0n];
  while (b) { const q = a / b; [a, b] = [b, a % b]; [x, y] = [y, x - q * y]; }
  return Number((BigInt(next) * x) & 0xffffffffn);
}
describe('[01-board 随机数] native six-lane RNG', () => {
  it.each([0, 1, 123456789, 0x80000000, 0xffffffff])('matches 40 independent steps per lane, seed=%s', seed => {
    const rng = new NativeRng(createRngState());
    rng.setRandSeed(seed, ALL_RAND_TYPES);
    for (const lane of Object.values(RandType)) {
      let expected = seed;
      for (let i = 0; i < 40; i++) {
        expected = advance(expected);
        expect(rng.randUnitF(lane)).toBe((expected >>> 10) / 4194304);
        expect(rng.getRandSeed(lane)).toBe(expected);
      }
    }
  });
  it('sets all six via sentinel, flushes once per lane, and isolates individual updates', () => {
    const trace: RngCall[] = []; const state = createRngState(); const rng = new NativeRng(state, call => trace.push(call));
    rng.setRandSeed(-1, ALL_RAND_TYPES); rng.flushRandSeeds();
    expect(state.seeds).toEqual(Array(6).fill(advance(0xffffffff)));
    expect(trace.map(call => [call.index, call.operation, call.lane])).toEqual(Object.values(RandType).map((lane, i) => [i + 1, 'FlushRandSeeds', lane]));
    rng.setRandSeed(0, RandType.RAND_TILE);
    expect(rng.getRandSeed(RandType.RAND_TILE)).toBe(0);
    rng.randUnitF(RandType.RAND_COSMETIC);
    expect(state.seeds[1]).toBe(0); expect(state.calls).toBe(7);
    expect(() => rng.getRandSeed(6 as RandType)).toThrow(RangeError);
    expect(() => rng.setRandSeed(1, -1)).toThrow(RangeError);
    expect(() => rng.randI(0, 1, 9 as RandType)).toThrow(RangeError);
  });
  it('Rand rounds every arithmetic stage, including reversed float bounds', () => {
    const rng = new NativeRng(createRngState()); let seed = 987654321;
    rng.setRandSeed(seed, RandType.RAND_OTHER);
    for (const [a, b] of [[-7.1, 13.3], [12.7, -9.2], [1, 1]]) {
      seed = advance(seed); const u = (seed >>> 10) / 4194304;
      const expected = Math.fround(Math.fround(a!) + Math.fround(Math.fround(Math.fround(b!) - Math.fround(a!)) * u));
      expect(rng.rand(a!, b!, RandType.RAND_OTHER)).toBe(expected);
    }
    expect(() => rng.rand(NaN, 1, RandType.RAND_TILE)).toThrow(RangeError);
  });
  it.each([[1, 100], [100, 1], [-10, -2], [-2, -10]])('RandI includes endpoints of [%s,%s]', (a, b) => {
    const rng = new NativeRng(createRngState());
    rng.setRandSeed(0, RandType.RAND_TILE);
    expect(rng.randI(a, b, RandType.RAND_TILE)).toBe(Math.min(a, b));
    rng.setRandSeed(inverseSeed(0xffffffff), RandType.RAND_TILE);
    expect(rng.randI(a, b, RandType.RAND_TILE)).toBe(Math.max(a, b));
  });
  it('documents float32 upper rounding even for a small singleton range', () => {
    const rng = new NativeRng(createRngState());
    rng.setRandSeed(0, RandType.RAND_TILE); expect(rng.randI(5, 5, RandType.RAND_TILE)).toBe(5);
    rng.setRandSeed(inverseSeed(0xffffffff), RandType.RAND_TILE);
    expect(rng.randI(5, 5, RandType.RAND_TILE)).toBe(6); // f32(5 + (1-2^-22)) = 6, no native clamp.
  });
  it('RandI floors negative samples instead of truncating toward zero', () => {
    const rng = new NativeRng(createRngState()); rng.setRandSeed(inverseSeed(0x40000000), RandType.RAND_TILE);
    expect(rng.randI(-4, -2, RandType.RAND_TILE)).toBe(-4); // -4+3*.25=-3.25 -> floor=-4
    expect(() => rng.randI(0.5, 2, RandType.RAND_TILE)).toThrow(RangeError);
  });
  it('wraps the signed integer span before float conversion as in ARM adds/subs', () => {
    const rng = new NativeRng(createRngState());
    rng.setRandSeed(inverseSeed(0x80000000), RandType.RAND_TILE);
    // (INT_MAX - INT_MIN + 1) wraps to zero before vcvt.f32.s32.
    expect(rng.randI(-2147483648, 2147483647, RandType.RAND_TILE)).toBe(-2147483648);
  });
  it('records one call per public draw, caller range and monotonic replay ordinal', () => {
    const state = createRngState(); const calls: RngCall[] = []; const rng = new NativeRng(state, call => calls.push(call));
    rng.randI(10, -2, RandType.RAND_UPGRADE); rng.rand(3, 7, RandType.RAND_SKILL); rng.randUnitF(RandType.RAND_OTHER);
    expect(calls.map(c => [c.index, c.operation, c.lane, c.range])).toEqual([[1, 'RandI', 4, [10, -2]], [2, 'Rand', 3, [3, 7]], [3, 'RandUnitF', 5, [0, 1]]]);
    new NativeRng(state).randUnitF(RandType.RAND_TILE);
    expect(state.calls).toBe(4);
  });
});
