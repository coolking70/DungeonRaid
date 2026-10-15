import enumsJson from '../../data/enums.json';
import itemsJson from '../../data/items.json';
import classesJson from '../../data/classes.json';
import turnJson from '../../data/turn.json';

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
/** Values, names and provenance are from the extracted JSON, never TS enum ordinals. */
export const enumData = freeze(enumsJson);
export const itemData = freeze(itemsJson);
export const classData = freeze(classesJson);
export const turnData = freeze(turnJson);
export type EnumName = keyof typeof enumsJson.enums;
export function enumValue(group: EnumName, name: string): number {
  const entry = enumData.enums[group].find(entry => entry.name === name);
  if (!entry) throw new RangeError(`Unknown ${group}.${name}`);
  return entry.value;
}
function named<K extends string>(group: EnumName, keys: readonly K[]): Readonly<Record<K, number>> {
  return Object.freeze(Object.fromEntries(keys.map(key => [key, enumValue(group, key)]))) as Record<K, number>;
}
export const TileType = named('TileType', ['TILE_POTION', 'TILE_SKULL', 'TILE_COIN', 'TILE_SHIELD', 'TILE_SWORD', 'TILE_SPECIAL', 'TILE_NONE']);
export const SpecialTileType = named('SpecialTileType', ['SPECIAL_TILE_CHAIN', 'SPECIAL_TILE_TROPHY', 'SPECIAL_TILE_NONE']);
export const GameMode = named('GameMode', ['MODE_CLASSIC', 'MODE_SPRINT', 'MODE_PRETZEL']);
export const Difficulty = named('Difficulty', ['DIFF_EASY', 'DIFF_NORMAL', 'DIFF_HARD', 'DIFF_HARDER']);
export type RandType = 0 | 1 | 2 | 3 | 4 | 5;
const lanes = named('RandType', ['RAND_COSMETIC', 'RAND_TILE', 'RAND_ITEM', 'RAND_SKILL', 'RAND_UPGRADE', 'RAND_OTHER']);
if (Object.values(lanes).some(value => value < 0 || value > 5)) throw new Error('Invalid RNG data');
export const RandType = lanes as Readonly<Record<keyof typeof lanes, RandType>>;
export const ALL_RAND_TYPES = enumValue('RandType', 'RAND_TYPE_COUNT');
export function getClass(id: number) {
  const result = classData.classes.find(entry => entry.class.value === id);
  if (!result) throw new RangeError(`Unknown class ${id}`);
  return result;
}
export function getRace(id: number) {
  const result = classData.races.find(entry => entry.race.value === id);
  if (!result) throw new RangeError(`Unknown race ${id}`);
  return result;
}
export function getItemSlot(id: number) {
  const result = itemData.slots.find(entry => entry.itemType.value === id);
  if (!result) throw new RangeError(`Unknown item slot ${id}`);
  return result;
}
export function getNativeSkill(id: number) {
  const result = classData.skills.find(entry => entry.nativeId === id);
  if (!result) throw new RangeError(`Unknown native skill ${id}`);
  return result;
}
export function upgradeId(key: string): number {
  const result = itemData.upgrades.find(entry => entry.key === key);
  if (!result) throw new RangeError(`Unknown upgrade ${key}`);
  return result.nativeId;
}
