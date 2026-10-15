import { describe, expect, it } from 'vitest';
import { f32, fadd, fsub, fmul, fdiv, fsqrt, floatToInt, i32, u32, iadd, isub, imul, umul, idiv, floatFromBits } from '../src/core/num';

describe('[PLAN P2 数值忠实] numeric primitives', () => {
  it('rounds float32 negative values, ties, underflow and overflow', () => {
    expect(f32(-1.1)).toBe(-1.100000023841858);
    expect(f32(16777217)).toBe(16777216);
    expect(f32(2 ** -150)).toBe(0);
    expect(f32(1e40)).toBe(Infinity);
  });
  it('rounds add/subtract operands and results separately', () => {
    expect(fadd(16777217, -16777216)).toBe(0);
    expect(fsub(-16777217, -16777216)).toBe(0);
    expect(fadd(-0.1, -0.2)).toBe(Math.fround(Math.fround(-0.1) + Math.fround(-0.2)));
    expect(fsub(3.4e38, -3.4e38)).toBe(Infinity);
  });
  it('rounds multiply/divide/sqrt and rejects unsupported domains', () => {
    expect(fmul(-1.1, 3.3)).toBe(Math.fround(Math.fround(-1.1) * Math.fround(3.3)));
    expect(fmul(3.4e38, 2)).toBe(Infinity);
    expect(fdiv(-7, 3)).toBe(Math.fround(-7 / 3));
    expect(fdiv(1, 3.4e38)).toBe(Math.fround(1 / Math.fround(3.4e38)));
    expect(() => fdiv(1, 0)).toThrow(RangeError);
    expect(fsqrt(2)).toBe(Math.fround(Math.sqrt(2)));
    expect(fsqrt(0)).toBe(0);
    expect(fsqrt(16777217)).toBe(4096);
    expect(() => fsqrt(-1)).toThrow(RangeError);
  });
  it.each([[2.9, 2], [-2.9, -2], [-0.9, 0], [-2147483648, -2147483648], [2147483520, 2147483520]])('ARM float-to-int truncates %s to %s', (a, b) => expect(floatToInt(a)).toBe(b));
  it.each([NaN, Infinity, -Infinity, 2147483647, -2147483904])('rejects unverified conversion %s', a => expect(() => floatToInt(a)).toThrow(RangeError));
  it('wraps signed and unsigned 32-bit values including negative inputs', () => {
    expect(i32(0x80000000)).toBe(-2147483648);
    expect(i32(0x100000001)).toBe(1);
    expect(i32(-2147483649)).toBe(2147483647);
    expect(u32(-1)).toBe(0xffffffff);
    expect(u32(0x100000001)).toBe(1);
  });
  it('adds, subtracts and multiplies with low-32-bit overflow', () => {
    expect(iadd(2147483647, 1)).toBe(-2147483648);
    expect(iadd(-3, -4)).toBe(-7);
    expect(isub(-2147483648, 1)).toBe(2147483647);
    expect(isub(-3, -4)).toBe(1);
    expect(imul(-3, 7)).toBe(-21);
    expect(imul(0x7fffffff, 0x7fffffff)).toBe(1);
    expect(umul(-1, 16807)).toBe(Number((0xffffffffn * 16807n) & 0xffffffffn));
    expect(umul(0xffffffff, 0xffffffff)).toBe(1);
  });
  it('integer division truncates without float32 precision loss', () => {
    expect(idiv(-7, 3)).toBe(-2);
    expect(idiv(7, -3)).toBe(-2);
    expect(idiv(2147483647, 1)).toBe(2147483647);
    expect(idiv(-2147483648, -1)).toBe(-2147483648);
    expect(() => idiv(1, 0)).toThrow(RangeError);
  });
  it('reinterprets positive, negative, subnormal and overflow bit patterns', () => {
    expect(floatFromBits(0x40000000)).toBe(2);
    expect(floatFromBits(0xbf800000)).toBe(-1);
    expect(floatFromBits(1)).toBe(2 ** -149);
    expect(floatFromBits(0x7f800000)).toBe(Infinity);
    expect(floatFromBits(0x140000000)).toBe(2);
  });
});
