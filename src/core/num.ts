/** ARM single-precision arithmetic; round inputs as well as each operation. */
export const f32 = Math.fround;
export const fadd = (a: number, b: number): number => f32(f32(a) + f32(b));
export const fsub = (a: number, b: number): number => f32(f32(a) - f32(b));
export const fmul = (a: number, b: number): number => f32(f32(a) * f32(b));
export const fdiv = (a: number, b: number): number => {
  if (f32(b) === 0) throw new RangeError('Non-finite division is outside P2 numeric fidelity');
  return f32(f32(a) / f32(b));
};
export const fsqrt = (a: number): number => {
  if (a < 0) throw new RangeError('Negative square root');
  return f32(Math.sqrt(f32(a)));
};
/** Truncate finite float32 toward zero. B2 infinity conversion is deliberately unsupported. */
export function floatToInt(a: number): number {
  const value = f32(a);
  if (!Number.isFinite(value) || value < -2147483648 || value >= 2147483648) {
    throw new RangeError('Float is outside the verified ARM int32 conversion domain');
  }
  return Math.trunc(value) || 0;
}
export const i32 = (a: number): number => a | 0;
export const u32 = (a: number): number => a >>> 0;
export const iadd = (a: number, b: number): number => (a + b) | 0;
export const isub = (a: number, b: number): number => (a - b) | 0;
export const imul = Math.imul;
export const umul = (a: number, b: number): number => Math.imul(a, b) >>> 0;
/** Integer division must not round its operands to float32. */
export function idiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('Integer division by zero');
  return i32(Math.trunc(i32(a) / i32(b)));
}
export function floatFromBits(bits: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, u32(bits), true);
  return view.getFloat32(0, true);
}
