import { RandType, turnData } from './data';
import type { RandomSource } from './rng';

const data = turnData.cosmetic;
function draw(rng: RandomSource, range: readonly number[]): void { rng.rand(range[0]!, range[1]!, RandType.RAND_COSMETIC); }
/** Retain native seed consumption even without a renderer. Geometry-dependent particle
 * ranges affect only discarded vertex values, never draw count or branching/draw order.
 * Rand/RandI each advance NativeRng once, exactly like randUnitF here. No invented bounds.
 * 0x5aaf8: 3 + 10*3; 0x5a7d4: 1 + 10*8. Trace labels these as raw-unit draws. */
export function particleDraws(rng: RandomSource, kind: 'shatter' | 'sparks'): void {
  const count = kind === 'shatter' ? data.shatterDraws : data.sparkDraws;
  for (let i = 0; i < count; i++) rng.randUnitF(RandType.RAND_COSMETIC);
}
export function tokenDraws(rng: RandomSource, xp: boolean): void {
  for (const range of data.tokenRanges) draw(rng, range);
  if (xp) draw(rng, data.xpRange);
}
/** SimpleLabel @0x5fbc4; missing decompiler parameter verified as r2=0 in Thumb. */
export function labelDraw(rng: RandomSource, type: number): void {
  if (!data.fixedLabelTypes.includes(type)) draw(rng, data.labelRange);
}
export function flareDraw(rng: RandomSource): void { draw(rng, data.flareRange); }
export function flightDraw(rng: RandomSource, armour = false): void { draw(rng, armour ? data.armourFlightRange : data.flightRange); }
