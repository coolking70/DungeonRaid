import { classData, GameMode, itemData, upgradeId } from './data';
import { fadd, fmul, iadd, imul, isub } from './num';
import { hasFlaw, hasPerk, type RunState } from './state';

/** Minimal shared equipment path required by DestroyUpgrade; UpdateStats @0x26c94.
 * Does not generate items, menus, names or upgrades. T06 can reuse this recomputation. */
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
