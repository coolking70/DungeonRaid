import { applyStatReward } from '../src/core/progression';
import { itemData, enumData } from '../src/core/data';
import type { ItemState, MenuCandidate, RunState } from '../src/core/state';
import { upgradeStep } from '../src/core/equipment';
import type { I18n } from './i18n';
export function equipmentName(i: I18n, item: ItemState) {
  const map = itemData.nameMappings.find(m => item.icon >= m.iconStart && item.icon < m.iconEndExclusive)!;
  const prefix = item.displayPrefix < 0 ? i.source('Novice') : i.t(`item.prefix.${item.displayPrefix}`);
  const noun = i.t(`item.name.${map.pool.replace('m_names', '').toLowerCase()}.${item.suffixIndex}`);
  return i.t('item.name.format', { prefix, noun });
}
export const statName = (i: I18n, id: number) => i.source(itemData.upgrades.find(u => u.nativeId === id)?.displayName.text ?? String(id));
export function equipmentLines(i: I18n, item: ItemState, old?: ItemState): string[] {
  return item.stats.flatMap((v, n) => v || old?.stats[n] ? [`${statName(i,n)} ${v}${old ? ` (${v-(old.stats[n] ?? 0) >= 0 ? '+' : ''}${v-(old.stats[n] ?? 0)})` : ''}`] : []);
}
export function candidateContent(i: I18n, c: MenuCandidate, s: RunState): { title: string; lines: string[]; icon: string; item: boolean } {
  switch (c.kind) {
    case 'skill': return { title: i.t(`skill.${c.skill.id}.name`), lines: [`${i.t('ui.level', { level: c.skill.level })}  ${c.skill.charge}/${c.skill.cooldown}`, i.t(`skill.${c.skill.id}.desc`)], icon: `SkillType.${c.skill.id}`, item: false };
    case 'stat': return { title: i.source(enumData.enums.StatType.find(v => v.value === c.stat)?.displayName?.text ?? String(c.stat)), lines: statRewardLines(i,c.stat,s), icon: `StatIcon.${c.stat}`, item: false };
    case 'item': return { title: equipmentName(i, c.item), lines: [...equipmentLines(i,c.item,s.equipment.find(e => e.type === c.item.type)), ...(c.scroll ? [i.t('item.scroll.name', { skill: i.t(`skill.${c.scroll.id}.name`) }), i.t(`skill.${c.scroll.id}.desc`)] : [])], icon: String(c.item.icon), item: true };
    case 'upgrade': return { title: statName(i,c.stat), lines: [`+${c.value || upgradeStep(s, c.stat)}`], icon: String(s.equipment.find(e => e.type === c.itemType)!.icon), item: true };
  }
}

/** Reuse deterministic reward function on a private copy; no RNG or live mutation. */
export function statRewardLines(i:I18n,stat:number,s:RunState):string[]{
  const copy=structuredClone(s);applyStatReward(copy,stat);
  const keys=['strength','dexterity','vitality','luck','damage','repair','healing','maxHealth'] as const;
  const names=['Strength','Dexterity','Vitality','Luck','Base damage','Repair','Heal','Health'];
  const result=keys.flatMap((key,n)=>copy.base[key]!==s.base[key]?[`${i.source(names[n]!)} +${copy.base[key]-s.base[key]}`]:[]);
  for(const key of ['coin','potion','xp','shield'] as const)if(copy.base.bonusToken[key]!==s.base.bonusToken[key]) result.push(`${i.source({coin:'Gold',potion:'Potion',xp:'Experience',shield:'Armour'}[key])} +${copy.base.bonusToken[key]-s.base.bonusToken[key]}%`);
  return result;
}
