import { RandType, turnData } from './data';
import type { RandomSource } from './rng';

const data = turnData.cosmetic;
export interface CosmeticSample { kind: 'token' | 'xp-token' | 'shatter' | 'sparks' | 'label' | 'flare' | 'flight'; values: number[]; labelType?: number; eventIndex?: number }
const observers = new WeakMap<RandomSource, (sample: CosmeticSample) => void>();
/** Optional read-only presentation tap; samples never enter RunState or consume RNG. */
export function observeCosmetics(rng: RandomSource, sink: (sample: CosmeticSample) => void) { observers.set(rng, sink); }
function emit(rng: RandomSource, kind: CosmeticSample['kind'], values: number[], labelType?: number) { observers.get(rng)?.({ kind, values, ...(labelType === undefined ? {} : { labelType }) }); }
function draw(rng: RandomSource, range: readonly number[]): number { return rng.rand(range[0]!, range[1]!, RandType.RAND_COSMETIC); }
/** Retain native seed consumption even without a renderer. Geometry-dependent particle
 * ranges affect only discarded vertex values, never draw count or branching/draw order.
 * Rand/RandI each advance NativeRng once, exactly like randUnitF here. No invented bounds.
 * 0x5aaf8: 3 + 10*3; 0x5a7d4: 1 + 10*8. Trace labels these as raw-unit draws. */
export function particleDraws(rng: RandomSource, kind: 'shatter' | 'sparks'): void {
  const count = kind === 'shatter' ? data.shatterDraws : data.sparkDraws;
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(rng.randUnitF(RandType.RAND_COSMETIC));
  emit(rng, kind, values);
}
export function tokenDraws(rng: RandomSource, xp: boolean): void {
  const values: number[] = [];
  for (const range of data.tokenRanges) values.push(draw(rng, range));
  if (xp) values.push(draw(rng, data.xpRange));
  emit(rng, xp ? 'xp-token' : 'token', values);
}
/** SimpleLabel @0x5fbc4; missing decompiler parameter verified as r2=0 in Thumb. */
export function labelDraw(rng: RandomSource, type: number): void {
  const speed = !data.fixedLabelTypes.includes(type) ? draw(rng, data.labelRange) : type === 3 ? .08 : .1;
  emit(rng, 'label', [speed], type);
}
export function flareDraw(rng: RandomSource): void { emit(rng, 'flare', [draw(rng, data.flareRange)]); }
export function flightDraw(rng: RandomSource, armour = false): void { emit(rng, 'flight', [draw(rng, armour ? data.armourFlightRange : data.flightRange)]); }
