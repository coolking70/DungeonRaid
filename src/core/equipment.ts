import { isSprint } from './board';
import type { RandomSource } from './rng';
import { classData, GameMode, getItemSlot, itemData, RandType, upgradeId } from './data';
import { fadd, fmul, iadd, imul, isub } from './num';
import { hasFlaw, hasPerk, type ItemState, type RunState } from './state';

/** Shared UpdateStats @0x26c94 for purchases, upgrades and DestroyUpgrade. */
export function updateEquipmentStats(s: RunState): void {
  const e = s.equipmentStats, oldHealth = e.maxHealth, oldArmour = e.maxArmour, oldCooldown = e.cooldown;
  const sum = (key: string) => s.equipment.reduce((n, item) => iadd(n, item.stats[upgradeId(key)]!), 0);
  const pretzel = s.challenge && s.mode === GameMode.MODE_PRETZEL;
  e.weaponDamage = sum('weaponDamage'); e.maxArmour = sum('armour');
  e.strength = sum('strength'); e.dexterity = sum('dexterity'); e.vitality = sum('vitality'); e.luck = sum('luck');
  const [strength, dexterity, vitality, luck] = classData.statIncrements.values;
  e.maxHealth = pretzel ? 0 : iadd(sum('maxHealth'), imul(e.vitality, vitality!));
  e.damage = iadd(sum('baseDamage'), imul(e.strength, strength!));
  e.healing = imul(e.luck, luck!); e.repair = iadd(sum('repair'), imul(e.dexterity, dexterity!));
  e.pierceThreshold = Math.min(95, iadd(hasFlaw(s, 'FLAW_CAUTIOUS') ? 30 : 50, sum('piercePercent')));
  e.breakThreshold = Math.max(5, isub(50, sum('durabilityPercent')));
  e.poison = sum('poisonDamage'); e.leechPercent = sum('leechPercent'); e.spikes = sum('spikes');
  e.weaken = sum('weakenAttack'); e.regeneration = sum('regeneration'); e.cooldown = sum('cooldownFlag') > 0;
  // Skill::GetStatChance @0x5ff0c returns 5.
  e.bonusToken = { coin: imul(e.luck, 5), potion: imul(e.vitality, 5), xp: imul(e.strength, 5), shield: imul(e.dexterity, 5) };
  for (const [bar, key] of [['xp', 'xpQuarterBonus'], ['gold', 'goldQuarterBonus'], ['upgrade', 'upgradeQuarterBonus']] as const) {
    const upgrade = itemData.upgrades.find(u => u.key === key)!;
    s.resources[bar].bonus = Math.min(upgrade.derivedCap!, s.equipment.reduce((n, item) => fadd(n, fmul(item.stats[upgrade.nativeId]!, upgrade.rawUnit!)), 0));
  }
  if (e.maxHealth > oldHealth) s.health = iadd(s.health, isub(e.maxHealth, oldHealth));
  else if (e.maxHealth < oldHealth) s.health = Math.min(s.health, iadd(s.base.maxHealth, e.maxHealth));
  s.armour = Math.max(0, isub(e.maxArmour, isub(oldArmour, s.armour)));
  if (oldCooldown !== e.cooldown) for (const skill of s.skills) if (skill) {
    skill.cooldown = iadd(skill.cooldown, e.cooldown ? -1 : 1);
    skill.charge = Math.min(skill.charge, skill.cooldown);
  }
}
/** ReduceStat @0x4dbe0 → GetStatDowngrade @0x5193c; bands are extracted JSON. */
export function downgradeStep(s: RunState, id: number): number {
  const entry = itemData.upgrades.find(u => u.nativeId === id);
  if (!entry) throw new RangeError(`Unknown upgrade ${id}`);
  const rule = entry.downgradeStep;
  if (rule.bands) {
    const metric = rule.metric === 'totalLeechPercent' ? s.equipmentStats.leechPercent : 100 - s.equipmentStats.breakThreshold;
    if (rule.breakThresholdAbove100 !== undefined && s.equipmentStats.breakThreshold > 100) return rule.breakThresholdAbove100;
    const band = rule.bands.find(([lo, hi]) => metric >= lo! && (hi === null || metric <= hi!));
    if (!band) throw new RangeError('Invalid downgrade metric');
    return band[2]!;
  }
  const up = entry.upgradeStep;
  if (up.pretzelOverride !== undefined && s.challenge && s.mode === GameMode.MODE_PRETZEL) return up.pretzelOverride;
  if (up.perkOverride && hasPerk(s, up.perkOverride.perk.name)) return up.perkOverride.value;
  if (up.constant === undefined) throw new Error('Missing downgrade constant');
  return up.constant;
}

/** GetStatUpgrade @0x51888. The bands and constant increments live in items.json. */
export function upgradeStep(s: RunState, id: number): number {
  const rule = itemData.upgrades.find(u => u.nativeId === id)?.upgradeStep;
  if (!rule) throw new RangeError(`Unknown upgrade ${id}`);
  if (rule.bands) {
    const metric = rule.metric === 'totalLeechPercent' ? s.equipmentStats.leechPercent : 100 - s.equipmentStats.breakThreshold;
    if (rule.breakThresholdAbove100 !== undefined && s.equipmentStats.breakThreshold > 100) return rule.breakThresholdAbove100;
    const band = rule.bands.find(([lo, hi]) => metric >= lo! && (hi === null || metric <= hi!));
    if (!band) throw new RangeError('Invalid upgrade metric');
    return band[2]!;
  }
  if (rule.pretzelOverride !== undefined && isPretzel(s)) return rule.pretzelOverride;
  if (rule.perkOverride && hasPerk(s, rule.perkOverride.perk.name)) return rule.perkOverride.value;
  return rule.constant!;
}
export const isPretzel = (s: RunState): boolean => s.challenge && s.mode === GameMode.MODE_PRETZEL;
/** IsUpgradeAllowed @0x517b8; tests current totals, never clamps the next increment. */
export function isUpgradeAllowed(s: RunState, id: number): boolean {
  switch (id) {
    case 2: return s.equipmentStats.leechPercent < 25;
    case 4: return s.equipmentStats.pierceThreshold < 95;
    case 6: return s.resources.xp.bonus < 2;
    case 7: return s.resources.gold.bonus < 2;
    case 13: return s.resources.upgrade.bonus < 2;
    case 10: return !isPretzel(s);
    case 14: return 100 - Math.min(s.equipmentStats.breakThreshold, 100) < 90;
    default: return true;
  }
}
/** GetRandomStat @0x51db8: even a weapon with weaken=0 consumes R(0,0,UPGRADE). */
export function randomUpgrade(s: RunState, type: number, allowCooldown: boolean, rng: RandomSource): number {
  let pool = [...getItemSlot(type).upgradePool];
  if (!allowCooldown) pool = pool.filter(id => id !== 5);
  if (isSprint(s) || rng.randI(0, s.equipmentStats.weaken, RandType.RAND_UPGRADE) !== 0) pool = pool.filter(id => id !== 15);
  pool = pool.filter(id => isUpgradeAllowed(s, id));
  const id = pool[rng.randI(0, pool.length - 1, RandType.RAND_UPGRADE)];
  if (id === undefined) throw new RangeError('Upgrade RNG index outside candidate pool');
  return id;
}
export function increaseStat(s: RunState, item: ItemState, id: number): void {
  item.stats[id] = Math.max(0, iadd(item.stats[id]!, upgradeStep(s, id)));
}
export function itemName(item: ItemState): string {
  const mapping = itemData.nameMappings.find(m => item.icon >= m.iconStart && item.icon < m.iconEndExclusive);
  if (!mapping) throw new RangeError('Invalid item icon');
  const names = itemData.names[mapping.pool as keyof typeof itemData.names];
  return `${item.displayPrefix < 0 ? 'Novice' : itemData.names.m_prefixes[item.displayPrefix]!.text}  ${names[item.suffixIndex]!.text}`;
}
/** Initialise(Item*) @0x515f8 → GenerateName @0x4c35c → GenerateStats @0x50ee4. */
export function generateItem(s: RunState, old: ItemState, rng: RandomSource): ItemState {
  const slot = getItemSlot(old.type);
  const item: ItemState = { type: old.type, icon: rng.randI(slot.iconRangeInclusive[0]!, slot.iconRangeInclusive[1]!, RandType.RAND_ITEM), prefixAnchor: old.prefixAnchor, displayPrefix: -1, suffixIndex: -1, stats: Array<number>(20).fill(0) };
  const n = itemData.names.m_prefixes.length;
  if (old.prefixAnchor < n - 12) item.prefixAnchor = item.displayPrefix = rng.randI(old.prefixAnchor + 1, old.prefixAnchor + 10, RandType.RAND_ITEM);
  else item.displayPrefix = rng.randI(old.prefixAnchor, n - 1, RandType.RAND_ITEM);
  const mapping = itemData.nameMappings.find(m => item.icon >= m.iconStart && item.icon < m.iconEndExclusive)!;
  item.suffixIndex = rng.randI(0, itemData.names[mapping.pool as keyof typeof itemData.names].length - 1, RandType.RAND_ITEM);
  const chance = (p: number) => rng.rand(0, 1, RandType.RAND_ITEM) < Math.fround(p);
  const main = old.type === 0 ? 0 : old.type === 4 ? 10 : 11;
  const pool = old.stats.flatMap((value, id) => value > 0 && id !== main ? [id] : []);
  const doubleArmour = old.type === 2 && chance(.2);
  item.stats[main] = iadd(old.stats[main]!, old.type === 4 ? Math.trunc(upgradeStep(s, 10) / 2) : doubleArmour ? 2 : 1);
  let upgraded = false;
  for (const id of pool) {
    const value = old.stats[id]!;
    const reduce = () => { item.stats[id] = Math.max(0, isub(value, downgradeStep(s, id))); };
    const add = (key: number) => { item.stats[key] = iadd(item.stats[key]!, 1); };
    if (old.type === 0 && chance(.15)) { reduce(); add(0); }
    else if (old.type === 1 && chance(.2)) {
      if (isUpgradeAllowed(s, id) && !upgraded && chance(.5)) { item.stats[id] = iadd(value, upgradeStep(s, id)); upgraded = true; }
      else { reduce(); add(11); }
    } else if (old.type === 2 && !doubleArmour && chance(.1)) { reduce(); add(11); }
    else if (old.type === 3 && chance(id === 0 ? .7 : .2)) { reduce(); add(id !== 0 && chance(.2) ? 0 : 11); }
    else if (old.type === 4 && chance(.1)) {
      reduce(); increaseStat(s, item, randomUpgrade(s, 4, false, rng));
    } else item.stats[id] = value;
  }
  if (old.type === 4 && (isPretzel(s) || chance(.5))) increaseStat(s, item, randomUpgrade(s, 4, item.stats[5] === 0, rng));
  return item;
}
