import { ALL_RAND_TYPES, type RandType } from './data';
import { f32, fadd, fsub, fmul, floatFromBits, floatToInt, iadd, isub, umul, u32 } from './num';
export { RandType } from './data';
export type Seeds = [number, number, number, number, number, number];
export interface RngState { seeds: Seeds; calls: number }
export interface RngCall {
  index: number;
  operation: 'RandUnitF' | 'Rand' | 'RandI' | 'FlushRandSeeds';
  lane: RandType;
  range: readonly [number, number] | null;
  before: number;
  after: number;
  result: number;
}
export type RngHook = (call: Readonly<RngCall>) => void;
/** Injectable implementation: tests may supply queues, production uses NativeRng. */
export interface RandomSource {
  randUnitF(lane: RandType): number;
  rand(a: number, b: number, lane: RandType): number;
  randI(a: number, b: number, lane: RandType): number;
}
export function createRngState(): RngState { return { seeds: [0, 0, 0, 0, 0, 0], calls: 0 }; }
function checkLane(lane: number): asserts lane is RandType {
  if (!Number.isInteger(lane) || lane < 0 || lane >= ALL_RAND_TYPES) throw new RangeError(`Invalid RNG lane ${lane}`);
}
/** RandUnitF @0x67610, Rand @0x67650, RandI @0x67bf4. Owns no hidden state. */
export class NativeRng implements RandomSource {
  constructor(readonly state: RngState, private readonly hook?: RngHook) {}
  setRandSeed(seed: number, lane: number): void {
    if (lane === ALL_RAND_TYPES) this.state.seeds.fill(u32(seed));
    else { checkLane(lane); this.state.seeds[lane] = u32(seed); }
  }
  getRandSeed(lane: RandType): number { checkLane(lane); return this.state.seeds[lane]; }
  private draw(operation: RngCall['operation'], lane: RandType, range: RngCall['range'], calculate: (unit: number) => number): number {
    checkLane(lane);
    const before = this.state.seeds[lane];
    const after = umul(before, 16807);
    this.state.seeds[lane] = after;
    const unit = Math.max(0, Math.min(1, fsub(floatFromBits((after >>> 10) | 0x40000000), 2)));
    const result = calculate(unit);
    const index = ++this.state.calls;
    this.hook?.({ index, operation, lane, range, before, after, result });
    return result;
  }
  flushRandSeeds(): void {
    for (let lane = 0; lane < ALL_RAND_TYPES; lane++) {
      checkLane(lane);
      this.draw('FlushRandSeeds', lane, null, unit => unit);
    }
  }
  randUnitF(lane: RandType): number { return this.draw('RandUnitF', lane, [0, 1], unit => unit); }
  rand(a: number, b: number, lane: RandType): number {
    if (!Number.isFinite(f32(a)) || !Number.isFinite(f32(b))) throw new RangeError('Non-finite RNG range');
    return this.draw('Rand', lane, [a, b], unit => fadd(a, fmul(fsub(b, a), unit)));
  }
  randI(a: number, b: number, lane: RandType): number {
    if (![a, b].every(n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647)) throw new RangeError('RNG requires int32 endpoints');
    // Huge ranges are outside 01-board's verified small-integer domain; no invented clamp.
    return this.draw('RandI', lane, [a, b], unit => floatToInt(Math.floor(fadd(Math.min(a, b), fmul(f32(iadd(isub(Math.max(a, b), Math.min(a, b)), 1)), unit)))));
  }
}
