import { cloneData } from './clone';
import { classAchievementRequests } from './achievements';
import { isSprint } from './board';
import { classData, getClass, getNativeSkill, getRace, RandType, SpecialTileType } from './data';
import { checkEndGame, matchTile, phase, refill, type RuleContext } from './combat';
import { isPretzel } from './equipment';
import { iadd } from './num';
import { emptyPreview, hasPerk, type ClassConfiguration, type Four, type RunState, type SkillState } from './state';

/** IsSkillUnlocked @0x248e8; 40/41 deliberately have no wrapper enum. */
export function isSkillUnlocked(s: RunState, id: number): boolean {
  getNativeSkill(id);
  if (id < 31) return true;
  return classData.classes.some(c => c.class.value !== 0 && c.baseSkillVector[0]!.value === id && s.classLevels[c.class.value] === 10);
}
export function getSkillPool(s: RunState): number[] {
  if (s.character.classId === 0) return classData.skills.filter(k => isSkillUnlocked(s, k.nativeId)).map(k => k.nativeId);
  const base = getClass(s.character.classId).baseSkillVector;
  return [...new Set(base.map((k, i) => s.character.replacementSkills[i] === undefined || s.character.replacementSkills[i] === 255 ? k.value : s.character.replacementSkills[i]!))].sort((a, b) => a - b);
}
/** Skill::Initialise @0x60984; candidates retain old charge and existing modifiers. */
export function initialiseSkill(s: RunState, id: number, old: SkillState | null = null): SkillState {
  const cooldown = (old ? old.cooldown - (old.level === 10 ? 0 : 1) : getNativeSkill(id).baseCooldown) - (isSprint(s) ? 4 : 0);
  return { id, cooldown, charge: old ? Math.min(old.charge, cooldown) : cooldown, level: isSprint(s) ? 5 : Math.min(10, old ? old.level + 1 : 1), active: false };
}
/** SetSkill @0x2be04. Receives a prepared menu template, not an ID to initialise twice. */
export function setSkill(s: RunState, candidate: SkillState): void {
  const skill = { ...candidate }, existing = s.skills.findIndex(k => k?.id === skill.id);
  if (existing >= 0) { s.skills[existing] = skill; return; }
  const slot = s.skills.findIndex(k => k === null);
  if (slot < 0) throw new Error('All four skill slots are occupied');
  s.skills[slot] = skill;
  s.selectedSkillCount = s.skills.filter(Boolean).length;
  skill.cooldown -= (s.equipmentStats.cooldown ? 1 : 0) + (s.selectedSkillCount === 4 && hasPerk(s, 'PERK_CUNNING') ? 1 : 0);
  skill.charge = Math.min(skill.charge, skill.cooldown);
}
export function applyStatReward(s: RunState, stat: number): void {
  if (!Number.isInteger(stat) || stat < 0 || stat > 7) throw new RangeError('Invalid stat reward');
  const [str, dex, vit, luk] = classData.statIncrements.values;
  const chance = (key: keyof RunState['base']['bonusToken']) => { s.base.bonusToken[key] = Math.min(100, iadd(s.base.bonusToken[key], 5)); };
  const hp = (amount: number) => { if (!isPretzel(s)) { s.base.maxHealth = iadd(s.base.maxHealth, amount); s.health = iadd(s.health, amount); } };
  switch (stat) {
    case 0: s.base.strength++; s.base.damage = iadd(s.base.damage, str!); chance('xp'); break;
    case 1: s.base.dexterity++; s.base.repair = iadd(s.base.repair, dex!); chance('shield'); break;
    case 2: s.base.vitality++; hp(vit!); chance('potion'); break;
    case 3: s.base.luck++; s.base.healing = iadd(s.base.healing, luk!); chance('coin'); break;
    case 4: s.base.damage = iadd(s.base.damage, 2 * str!); break;
    case 5: s.base.repair = iadd(s.base.repair, 2 * dex!); break;
    case 6: hp(2 * vit!); break;
    case 7: for (const key of ['coin', 'potion', 'xp', 'shield'] as const) chance(key); break;
  }
}
/** Narrow native import for P19/S12. T07 owns complete save versioning. */
export function readNativeSkill(bytes: readonly number[]): SkillState {
  if (bytes.length !== 4 || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new RangeError('Skill record must contain four bytes');
  const [id, cd, charge, level] = bytes as [number, number, number, number]; getNativeSkill(id);
  return { id, cooldown: cd === 255 ? -1 : cd, charge: cd === 255 ? -1 : charge, level, active: false };
}
export const isPerkSlotUnlocked = (level: number, slot: number): boolean => level >= (classData.classLevelMilestones.perkSlots[slot] ?? Infinity);
export const replacementSkillsAllowed = (level: number): number => classData.classLevelMilestones.replacementCountsByLevel[Math.max(0, Math.min(10, level))]!;
export const canChangeRace = (level: number): boolean => level >= classData.classLevelMilestones.changeRace;
/** Structural validation for NewGame; configuration editing/level restrictions are explicit below. */
export function checkConfiguration(config: ClassConfiguration): ClassConfiguration {
  getClass(config.classId); getRace(config.race);
  for (const [group, entries] of [['PerkType', config.perks], ['FlawType', config.flaws]] as const) {
    if (entries.length !== 4 || entries.some(n => n !== 255 && (!Number.isInteger(n) || n < 0 || n > 9))) throw new RangeError(`Invalid ${group} slots`);
  }
  if (config.replacementSkills.length !== 20) throw new RangeError('Expected twenty replacement slots');
  for (const id of config.replacementSkills) if (id !== 255) getNativeSkill(id);
  return cloneData(config);
}
/** Validate @0x36390. Contrary to spec 05 prose, its count helper does not cap replacements.
 * The editor must consult replacementSkillsAllowed before accepting changes. */
export function validateConfiguration(config: ClassConfiguration, level: number): ClassConfiguration {
  const result = checkConfiguration(config);
  for (const key of ['perks', 'flaws'] as const) {
    const seen = new Set<number>();
    result[key] = result[key].map(id => { if (seen.has(id)) return 255; seen.add(id); return id; }) as Four<number>;
  }
  result.perks = result.perks.map((id, i) => result.flaws[i] === 255 ? 255 : id) as Four<number>;
  if (config.classId !== 0 && !canChangeRace(level)) result.race = getClass(config.classId).defaultRace.value;
  return result;
}
/** ProcessInput Trophy branch @0x330c0. This is a free action, with no ordinary enemy turn. */
export function claimTrophy(s: RunState, slot: number, c: RuleContext): void {
  if (s.phase !== 'input' || !Number.isInteger(slot) || s.board[slot]?.specialType !== SpecialTileType.SPECIAL_TILE_TROPHY || s.board[slot]!.matched || s.board[slot]!.frozen) throw new Error('No claimable trophy at this slot');
  const current = s.character.classId;
  let target: number | undefined;
  if (current !== 0 && s.classLevels[current]! < 10 && c.rng.randI(0, 1, RandType.RAND_OTHER) !== 0) target = current;
  else {
    const locked = s.classLevels.flatMap((level, id) => level === 0 ? [id] : []);
    if (locked.length) target = locked[c.rng.randI(0, locked.length - 1, RandType.RAND_OTHER)];
    else if (s.classLevels[current]! < 10) target = current;
  }
  if (target !== undefined) {
    const before = s.classLevels[target]!;
    s.classLevels[target] = Math.min(10, Math.max(1, before + 1));
    s.achievementQueue.push(...classAchievementRequests(s.classLevels, target));
    c.events.push({ type: 'ClassLevelChanged', classId: target, before, after: s.classLevels[target]! });
  }
  matchTile(s, slot, c, 'none'); refill(s, c);
  s.chain.nodes = []; s.chain.ignored = []; s.preview = emptyPreview(); s.board.forEach(t => { t.selected = false; });
  if (!checkEndGame(s, c)) { s.resumePhase = 'input'; phase(s, s.moving.length ? 'falling' : 'arrivals', c); }
  c.events.push({ type: 'TrophyClaimed', slot, classId: target ?? null });
}
