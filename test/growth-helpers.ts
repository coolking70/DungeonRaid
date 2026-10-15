import { expect } from 'vitest';
import { NativeRng, type RandomSource } from '../src/core/rng';
import type { RandType } from '../src/core/data';
import type { RuleContext } from '../src/core/combat';
import type { RunState } from '../src/core/state';
export const nativeContext = (s: RunState): RuleContext => ({ rng: new NativeRng(s.rng), events: [] });
export type Draw = ['i' | 'f', number, number, RandType, number];
/** Every non-cosmetic call must match the queued operation, bounds, lane AND order. */
export class GrowthRng implements RandomSource {
  calls: Draw[] = [];
  constructor(public queue: Draw[]) {}
  draw(kind: 'i' | 'f', a: number, b: number, lane: RandType): number {
    if (lane === 0) return a;
    const next = this.queue.shift();
    expect(next?.slice(0, 4), `unexpected ${kind}(${a},${b},${lane})`).toEqual([kind, a, b, lane]);
    this.calls.push(next!); return next![4];
  }
  randI(a: number, b: number, lane: RandType) { return this.draw('i', a, b, lane); }
  rand(a: number, b: number, lane: RandType) { return this.draw('f', a, b, lane); }
  randUnitF(lane: RandType) { return this.draw('f', 0, 1, lane); }
}
export function growthContext(queue: Draw[]): RuleContext & { rng: GrowthRng } { return { rng: new GrowthRng(queue), events: [] }; }
export const levelDraws = (): Draw[] => [['i', 0, 30, 3, 0], ['i', 0, 29, 3, 0], ['i', 0, 7, 3, 0], ['i', 0, 6, 3, 0]];
