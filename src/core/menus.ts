import { cloneData } from './clone';
import { isSprint } from './board';
import { phase, raceIs, type RuleContext } from './combat';
import { classData, enumData, getClass, getNativeSkill, itemData, RandType, type RandType as Lane } from './data';
import { generateItem, isPretzel, randomUpgrade, updateEquipmentStats, upgradeStep } from './equipment';
import { applyStatReward, getSkillPool, initialiseSkill, isSkillUnlocked, setSkill } from './progression';
import { activateScroll, canActivate } from './skills';
import type { MenuState, RunState } from './state';

function take(pool: number[], lane: Lane, c: RuleContext): number {
  if (!pool.length) throw new Error('Empty candidate pool');
  const value = pool.splice(c.rng.randI(0, pool.length - 1, lane), 1)[0];
  if (value === undefined) throw new RangeError('Menu RNG index outside candidate pool');
  return value;
}
/** FoldoutMenu::Initialise @0x42794; generate immediately at ShowMenu, in native order. */
export function generateMenu(s: RunState, kind: MenuState['kind'], c: RuleContext): MenuState {
  const menu: MenuState = { id: s.nextEffectId++, kind, selected: [], candidates: [] };
  if (kind === 'level') {
    const owned = s.skills.filter(k => k !== null), sprint = isSprint(s);
    const upgradable = owned.filter(k => k.level < 10 && k.id !== 33);
    let pool = owned.length === 4 ? [...new Set(owned.map(k => k.id))].sort((a, b) => a - b) : getSkillPool(s);
    pool = pool.filter(id => !owned.some(k => k.id === id && (sprint || k.level >= 10 || id === 33)) && !(sprint && id === 22) && !(isPretzel(s) && (id === 7 || id === 24)));
    const limit = Math.min(owned.length === 3 && (sprint || !upgradable.length) ? 1 : 2, pool.length);
    for (let i = 0; i < limit && pool.length; i++) {
      // Take the draw, then override. The originally drawn ID stays in the set when overridden.
      const index = c.rng.randI(0, pool.length - 1, RandType.RAND_SKILL);
      let id = pool[index];
      if (id === undefined) throw new RangeError('Skill RNG index outside candidate pool');
      const first = getClass(s.character.classId).baseSkillVector[0]!.value;
      if (i === 0 && s.level === 2 && s.character.classId !== 0 && !(sprint && first === 33)) id = first;
      const old = owned.find(k => k.id === id) ?? null;
      menu.candidates.push({ kind: 'skill', skill: initialiseSkill(s, id, old) });
      if (i === 0 && owned.length === 3 && old === null) pool = sprint ? [] : upgradable.map(k => k.id).sort((a, b) => a - b);
      else pool = pool.filter(n => n !== id);
    }
    const attributes = Array.from({ length: 8 }, (_, n) => n).filter(n => !(n === 6 && isPretzel(s)) && !(n === 7 && Object.keys(s.base.bonusToken).every(key => s.base.bonusToken[key as keyof typeof s.base.bonusToken] + s.equipmentStats.bonusToken[key as keyof typeof s.base.bonusToken] >= 100)));
    while (menu.candidates.length < 4) { const stat = take(attributes, RandType.RAND_SKILL, c); menu.candidates.push({ kind: 'stat', id: 42 + stat, stat }); }
  } else if (kind === 'shop' || kind === 'upgrade') {
    const slots = itemData.slots.map(slot => slot.itemType.value).sort((a, b) => a - b);
    for (let i = 0; i < (kind === 'shop' ? 3 : 4); i++) {
      const type = take(slots, kind === 'shop' ? RandType.RAND_ITEM : RandType.RAND_UPGRADE, c);
      const old = s.equipment.find(item => item.type === type)!;
      if (kind === 'shop') menu.candidates.push({ kind: 'item', item: generateItem(s, old, c.rng), scroll: null });
      else { const stat = randomUpgrade(s, type, old.stats[5] === 0, c.rng); menu.candidates.push({ kind: 'upgrade', itemType: type, stat, value: upgradeStep(s, stat) }); }
    }
    if (kind === 'shop' && c.rng.rand(0, 1, RandType.RAND_ITEM) < (raceIs(s, 'SAUREN') ? .5 : .25)) {
      const index = c.rng.randI(0, 2, RandType.RAND_ITEM);
      const exemption = c.rng.rand(0, 1, RandType.RAND_ITEM) < Math.fround(.1);
      if (!exemption && (s.options.scrollFilter !== 'supplied-native-fixture' || !c.hooks?.scrollNativeWord)) throw new Error('I1: scroll filtering requires supplied-native-fixture and scrollNativeWord');
      const pool = classData.skills.filter(k => {
        const id = k.nativeId;
        if (id === 33 || (isPretzel(s) && id === 24)) return false;
        if (!exemption) {
          const word = c.hooks!.scrollNativeWord!(s, id);
          if (!Number.isInteger(word)) throw new Error('I1: native fixture must supply each accessed word');
          if (word !== 0) return false;
        }
        return isSkillUnlocked(s, id) && canActivate(s, id);
      }).map(k => k.nativeId);
      // The native empty-vector dereference has no meaningful rule result; reject explicitly.
      if (!pool.length) throw new Error('I1: scroll fixture yields an empty native candidate vector');
      const candidate = menu.candidates[index];
      if (candidate?.kind !== 'item') throw new RangeError('Invalid scroll button');
      candidate.scroll = initialiseSkill(s, take(pool, RandType.RAND_ITEM, c));
    }
  } else throw new Error('Class unlock uses ClassLevelChanged, not a reward menu');
  return menu;
}
export function requestMenu(s: RunState, kind: MenuState['kind'], c: RuleContext): void {
  const menu = generateMenu(s, kind, c);
  s.menus.push(menu); c.events.push({ type: 'MenuRequested', menu: cloneData(menu) });
  if (s.phase !== 'menu') { s.menuResumePhase = s.phase; phase(s, 'menu', c); }
}
function activeMenu(s: RunState, id: number): MenuState {
  if (s.phase !== 'menu' || s.menus[0]?.id !== id) throw new Error('Menu must be handled in queue order');
  return s.menus[0];
}
/** ProcessInput @0x41d54. Clicking selected toggles off; full level selection ignores a third. */
export function selectMenuItem(s: RunState, id: number, index: number, c: RuleContext): void {
  const menu = activeMenu(s, id);
  if (!Number.isInteger(index) || !menu.candidates[index]) throw new RangeError('Invalid menu candidate');
  if (menu.selected.includes(index)) menu.selected.splice(menu.selected.indexOf(index), 1);
  else if (menu.kind !== 'level') menu.selected = [index];
  else if (menu.selected.length < 2) menu.selected.push(index);
  c.events.push({ type: 'MenuSelectionChanged', id, selected: [...menu.selected] });
}
/** Process @0x41fc4, selected order is application order; all three native menus require selection. */
export function confirmMenu(s: RunState, id: number, c: RuleContext, option: 'confirm' | 'skip' = 'confirm'): void {
  const menu = activeMenu(s, id);
  if (option === 'skip') throw new Error('Native reward menus cannot be skipped');
  if (menu.selected.length !== (menu.kind === 'level' ? 2 : 1)) throw new Error('Select the required number of menu candidates');
  // Remove this menu before a scroll can append Enchant's nested menu.
  s.menus.shift();
  for (const index of menu.selected) {
    const candidate = menu.candidates[index]!;
    if (candidate.kind === 'skill') setSkill(s, candidate.skill);
    else if (candidate.kind === 'stat') applyStatReward(s, candidate.stat);
    else if (candidate.kind === 'upgrade') {
      const item = s.equipment.find(item => item.type === candidate.itemType)!;
      item.stats[candidate.stat] = Math.max(0, (item.stats[candidate.stat]! + candidate.value) | 0); updateEquipmentStats(s);
    } else {
      const slot = s.equipment.findIndex(item => item.type === candidate.item.type);
      s.equipment[slot] = cloneData(candidate.item); updateEquipmentStats(s);
      if (candidate.scroll) { activateScroll(s, candidate.scroll, c); if (raceIs(s, 'SAUREN')) s.achievementQueue.push({ id: 49, progress: 2 }); }
    }
  }
  c.events.push({ type: 'MenuClosed', id });
  if (s.outcome || s.menus.length) return;
  let resume = s.menuResumePhase;
  if (resume === null) throw new Error('Menu has no continuation');
  s.menuResumePhase = null;
  // Enchant/scroll can create arrivals when the interrupted phase was input.
  if (resume === 'input' && (s.pending.length || s.moving.length)) { s.resumePhase = 'input'; resume = s.moving.length ? 'falling' : 'arrivals'; }
  if (resume === 'arrivals' && s.moving.length) resume = 'falling';
  phase(s, resume, c);
}
/** Display metadata are extracted native text; no wrapper mapping for 40/41. */
export function skillDescription(id: number): string {
  getNativeSkill(id);
  const entry = enumData.enums.SkillType.find(k => k.value === id);
  if (entry && 'description' in entry && entry.description) return entry.description.text;
  return enumData.nativeOnlySkillSlots.find(k => k.value === id)?.description.text ?? '';
}
