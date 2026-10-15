import { describe, expect, it } from 'vitest';
import { classData, enumData, enumValue, getClass, getItemSlot, getNativeSkill, getRace, itemData, upgradeId } from '../src/core/data';
import { createProfileState, createRunState } from '../src/core/state';

describe('[00/04/05/06 数据与状态] table identities and independent state', () => {
  it('loads every enum by its authoritative name/value and rejects unknown lookups', () => {
    for (const [group, values] of Object.entries(enumData.enums)) for (const entry of values) expect(enumValue(group as keyof typeof enumData.enums, entry.name)).toBe(entry.value);
    expect(() => enumValue('TileType', 'wrong')).toThrow(RangeError);
    expect(() => getClass(-1)).toThrow(RangeError); expect(() => getItemSlot(5)).toThrow(RangeError);
    expect(() => getRace(10)).toThrow(RangeError); expect(() => getNativeSkill(42)).toThrow(RangeError);
    expect(() => upgradeId('wrong')).toThrow(RangeError);
  });
  it('keeps native skills 40/41 distinct from wrapper COUNT and exposes table data', () => {
    expect(getNativeSkill(40).displayName.text).toBe('Shock');
    expect(getNativeSkill(41).normallyObtainable).toBe(false);
    expect(getItemSlot(0).initialStats[upgradeId('weaponDamage')]).toBe(2);
    expect(getRace(6).mortalEnemy.value).toBe(5);
    expect(Object.isFrozen(itemData.slots[0]!.initialStats)).toBe(true);
    expect(Object.isFrozen(classData.classes)).toBe(true);
  });
  it('profile defaults match ten classes and six score categories, without run-state ownership', () => {
    const p = createProfileState();
    expect(p.classes.map(c => c.level)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(p.highScores).toHaveLength(6);
    p.classes[0]!.perks[0] = 1; expect(createProfileState().classes[0]!.perks[0]).toBe(255);
    expect('profile' in createRunState()).toBe(false);
  });
  it('allocates independent tile poison, item vectors, current/next flags and resource bars', () => {
    const a = createRunState(), b = createRunState();
    a.board[0]!.poison[0] = 3; a.equipment[0].stats[0] = 9; a.current.forceCoin = true; a.resources.xp.carry = 0.25;
    expect(a.board[1]!.poison).toEqual([0, 0, 0]); expect(b.board[0]!.poison).toEqual([0, 0, 0]);
    expect(b.equipment[0].stats[0]).toBe(2); expect(a.next.forceCoin).toBe(false); expect(a.resources.gold.carry).toBe(0);
    expect(a.skills).toEqual([null, null, null, null]); expect(a.rng.seeds).toHaveLength(6);
    expect(structuredClone(a)).toEqual(a);
  });
});
