import { isSprint } from '../src/core/board';
import { applyStatReward } from '../src/core/progression';
import { Difficulty, specialData, itemData, enumData } from '../src/core/data';
import { mortalEnemy, type ItemState, type MenuCandidate, type ProfileState, type RunState } from '../src/core/state';
import { isPretzel, upgradeStep } from '../src/core/equipment';
import type { I18n } from './i18n';
/** Tooltip::Show(EnemyType) @0x662f0: append the current race's mortal-enemy warning. */
export function specialEnemyContent(i:I18n,s:RunState,enemy:number) {
  const name=i.t(`enemy.${enemy}.name`),mortal=enemy!==0&&mortalEnemy(s)===enemy;
  return {title:mortal?i.t('ui.enemy.mortal',{enemy:name}):name,
    lines:[i.t(`enemy.${enemy}.desc`),...(mortal?[i.t(`race.${s.character.race}.mortalEnemyDescription`)]:[]),
      ...(mortal&&s.character.race===2?[i.t('race.2.racialBonusDescription')]:[])]};
}
export function equipmentName(i: I18n, item: ItemState) {
  const map = itemData.nameMappings.find(m => item.icon >= m.iconStart && item.icon < m.iconEndExclusive)!;
  const prefix = item.displayPrefix < 0 ? i.source('Novice') : i.t(`item.prefix.${item.displayPrefix}`);
  const noun = i.t(`item.name.${map.pool.replace('m_names', '').toLowerCase()}.${item.suffixIndex}`);
  return i.t('item.name.format', { prefix, noun });
}
export const statName = (i: I18n, id: number) => i.source(itemData.upgrades.find(u => u.nativeId === id)?.displayName.text ?? String(id));
/** Item::MakeStatLabels @0x4bc74; IDs are item upgrades, not StatType. */
const itemTemplates = [
  '{value} Damage', '+{value} Base damage', '{value}% Life leech',
  '{value} Poison damage per turn for 3 turns', '+{value}% Armour piercing', '',
  '+{value} Experience points per skull', '+{value} Gold per coin', '+{value} Strength',
  '+{value} Luck', '+{value} Health', '{value} Defence', '{value} Spike damage to attacking enemies',
  '+{value} Upgrade points per shield', '+{value}% Armour durability',
  "{value} Blunting damage reduces enemies' attack", '+{value} Defence per shield',
  '+{value} Health at the end of each turn', '+{value} Dexterity', '+{value} Vitality',
];
const quarterStats = [6,7,13], percentStats = [2,4,14];
export function itemStatValue(id:number,raw:number):string {
  // GetFloatValue @0x5179c and GetFloatPrecision @0x51784.
  return `${quarterStats.includes(id)?raw*.25:raw}${percentStats.includes(id)?'%':''}`;
}
export function equipmentLines(i: I18n, item: ItemState, old?: ItemState): string[] {
  return item.stats.flatMap((raw,id)=>{
    if(!raw&&!old?.stats[id])return [];
    const value=quarterStats.includes(id)?raw*.25:raw;
    const description=id===5?`${i.t('item.upgrade.5.desc')}: ${raw}`:
      i.source(itemTemplates[id]!,{value,valuePrecision:raw%4===0?0:raw%2===0?1:2});
    return [description+(old?` (${itemStatValue(id,old.stats[id]??0)} >> ${itemStatValue(id,raw)})`:'')];
  });
}
export function upgradeDescription(i:I18n,s:RunState,id:number) {
  return isPretzel(s)&&id===19?i.source('(+5% bonus potion)'):i.t(`item.upgrade.${id}.desc`);
}
export interface CandidateContent { title:string; lines:string[]; summary?:string[]; icon:string; item:boolean; }
export function candidateContent(i: I18n, c: MenuCandidate, s: RunState): CandidateContent {
  switch (c.kind) {
    case 'skill': {
      const old=s.skills.find(k=>k?.id===c.skill.id);
      const cooldown=c.skill.cooldown<0?[]:[old?i.t('ui.skill.cooldownUpgrade',{current:old.cooldown,next:c.skill.cooldown}):i.t('ui.skill.cooldown',{cooldown:c.skill.cooldown})];
      return {title:i.t(`skill.${c.skill.id}.name`),lines:[i.t(`skill.${c.skill.id}.desc`),...cooldown],
        summary:[...cooldown,i.t(`skill.${c.skill.id}.desc`)],icon:`SkillType.${c.skill.id}`,item:false};
    }
    case 'stat': return { title: i.source(enumData.enums.StatType.find(v => v.value === c.stat)?.displayName?.text ?? String(c.stat)), lines: statRewardLines(i,c.stat,s), icon: `StatIcon.${c.stat}`, item: false };
    case 'item': {
      const old=s.equipment.find(e=>e.type===c.item.type);
      const summary=c.item.stats.flatMap((v,id)=>v||old?.stats[id]?[`${statName(i,id)} ${itemStatValue(id,v)} (${v-(old?.stats[id]??0)>=0?'+':''}${itemStatValue(id,v-(old?.stats[id]??0))})`]:[]);
      if(c.scroll)summary.unshift(i.t('item.scroll.name',{skill:i.t(`skill.${c.scroll.id}.name`)}));
      return {title:equipmentName(i,c.item),lines:[...equipmentLines(i,c.item,old),
        ...(c.scroll?[i.t('item.scroll.name',{skill:i.t(`skill.${c.scroll.id}.name`)}),i.t(`skill.${c.scroll.id}.desc`)]:[]),
        ...(old?[i.source('Replaces: {skill}',{skill:equipmentName(i,old)}),...equipmentLines(i,old)]:[])],summary,icon:String(c.item.icon),item:true};
    }
    case 'upgrade': {
      const item=s.equipment.find(e=>e.type===c.itemType)!,old=item.stats[c.stat]??0;
      const value=c.value||upgradeStep(s,c.stat);
      return {title:statName(i,c.stat),lines:[upgradeDescription(i,s,c.stat),
        old>0?`${itemStatValue(c.stat,old)} >> ${itemStatValue(c.stat,old+value)}`:itemStatValue(c.stat,value)],icon:String(item.icon),item:true};
    }
  }
}

/** Skill::Initialise(StatType) @0x606a4 uses base values (equipment is separate). */
export function statRewardLines(i:I18n,stat:number,s:RunState):string[]{
  const copy=structuredClone(s);applyStatReward(copy,stat);
  const effect:{[id:number]:[keyof Pick<RunState['base'],'damage'|'repair'|'maxHealth'|'healing'>,string]}={
    0:['damage','Base dmg: {current} >> {next}'],1:['repair','Armour per shield: {current} >> {next}'],
    2:['maxHealth','Max health: {current} >> {next}'],3:['healing','Health per potion: {current} >> {next}'],
    4:['damage','Base dmg: {current} >> {next}'],5:['repair','Armour per shield: {current} >> {next}'],6:['maxHealth','Max health: {current} >> {next}'],
  };
  const result:string[]=[];
  const e=effect[stat];
  if(e&&!(e[0]==='maxHealth'&&isPretzel(s)))result.push(i.source(e[1],{current:s.base[e[0]],next:copy.base[e[0]]}));
  const keys=stat===7?['coin','xp','shield','potion'] as const:stat<4?[(['xp','shield','potion','coin'] as const)[stat]!]:[];
  for(const key of keys){
    const label=i.source({xp:'Chance of bonus XP: ',shield:'Chance of bonus shield: ',potion:'Chance of bonus potion: ',coin:'Chance of bonus coin: '}[key]);
    result.push(`${label}${s.base.bonusToken[key]>=100?'100%':`${s.base.bonusToken[key]}% >> ${copy.base.bonusToken[key]}%`}`);
  }
  return result;
}
/** Port UI addition; MatchTile @0x2ac40 decrements before checking <1. */
export function trophyProgress(i:I18n,s:RunState){
  const eligible=s.character.classId!==0&&s.classLevels[s.character.classId]!<10||s.classLevels.slice(1).some(level=>level===0);
  const blocked=s.difficulty===Difficulty.DIFF_EASY?'easy':s.trophies.awarded>=specialData.trophyLimit?'limit':!eligible?'complete':null;
  const remaining=Math.max(1,s.trophies.remaining);
  const probabilistic=isSprint(s)&&s.trophies.remaining>0;
  return {label:i.t('trophy.remaining'),value:blocked?i.t(`trophy.${blocked}`):`${probabilistic?'≥':''}${remaining}`,boosted:false,
    lines:[i.t(blocked?`trophy.${blocked}`:probabilistic?'trophy.minimum':'trophy.count',{count:remaining}),
      ...(isSprint(s)?[i.t('trophy.sprint')]:[]),i.t('trophy.rules')]};
}
/** Before a run is chosen, show persisted progress with next-run conditions. */
export function profileTrophyProgress(i:I18n,p:ProfileState,s:RunState){
  if(!['idle','ended'].includes(s.phase))return trophyProgress(i,s);
  const eligible=p.classes.slice(1).some(c=>c.level<10),remaining=Math.max(1,p.trophyRemaining);
  return {label:i.t('trophy.remaining'),value:eligible?String(remaining):i.t('trophy.complete'),boosted:false,
    lines:[i.t(eligible?'trophy.count':'trophy.complete',{count:remaining}),i.t('trophy.nextRun'),i.t('trophy.rules')]};
}
/** StatsMenu::CreateLabels/Show @0x61178/0x614bc, SetLabelValue caps displayed percentages. */
export function statsRows(i:I18n,s:RunState,showTrophyProgress=true){
  const b=s.base,e=s.equipmentStats;
  const rows:[string,number,number,boolean?][]=[['Level',s.level,0],['Strength',b.strength,e.strength],['Base damage',b.damage,e.damage],['Bonus XP chance',b.bonusToken.xp,e.bonusToken.xp,true],
    ['Dexterity',b.dexterity,e.dexterity],['Defence per shield',b.repair,e.repair],['Bonus shield chance',b.bonusToken.shield,e.bonusToken.shield,true],
    ['Vitality',b.vitality,e.vitality],['Max health',b.maxHealth,e.maxHealth],['Bonus potion chance',b.bonusToken.potion,e.bonusToken.potion,true],
    ['Luck',b.luck,e.luck],['Health per potion',b.healing,e.healing],['Bonus coin chance',b.bonusToken.coin,e.bonusToken.coin,true],
    ['Weapon damage',e.weaponDamage,0],['Armour piercing',50,e.pierceThreshold-50,true],['Defence',e.maxArmour,0],['Armour durability',50,50-Math.min(e.breakThreshold,100),true]];
  return [...rows.map(([name,base,bonus,percent])=>({label:i.source(name),value:`${percent?Math.min(100,base+bonus):base+bonus}${percent?'%':''}`,boosted:bonus>0&&(!percent||base<100)})),...(showTrophyProgress?[trophyProgress(i,s)]:[])];
}
/** StatsMenu::Process @0x61d84, sixth icon exposes the active run configuration. */
export function characterContent(i:I18n,s:RunState){
  return {title:`${i.t(`race.${s.character.race}.name`)} ${i.t(`class.${s.character.classId}.name`)}`,
    lines:[i.t(`race.${s.character.race}.racialBonusDescription`),
      ...s.character.perks.filter(n=>n!==255).map(n=>i.t(`perk.${n}.desc`)),
      ...s.character.flaws.filter(n=>n!==255).map(n=>i.t(`flaw.${n}.desc`))]};
}

/** Live status is port UI detail, not part of native Tooltip::Show(EnemyType).
 * Omit inactive statuses instead of presenting zero poison/countdown as effects. */
export function enemyStatusLines(i:I18n,v:{attack:number;defence:number;health:number;maxHealth:number;countdown:number;poison:readonly number[]}){
  const zh=i.language==='zh';
  return [`${zh?'攻击':'Attack'} ${v.attack} · ${zh?'防御':'Defence'} ${v.defence}`,
    `${zh?'生命':'Health'} ${v.health} / ${v.maxHealth}`,
    ...(v.countdown>0?[`${zh?'能力倒计时':'Ability countdown'} ${v.countdown}`]:[]),
    ...(v.poison.some(n=>n>0)?[`${zh?'中毒（未来三回合）':'Poison (next 3 turns)'} ${v.poison.join(' / ')}`]:[])];
}
