import { classData, getClass, getRace } from '../src/core/data';
import type { ProfileState } from '../src/core/state';
import type { I18n } from './i18n';
import copy from './help-copy.json';

export type HelpCopyKey = keyof typeof copy.messages;
export function helpCopy(i:I18n,key:HelpCopyKey,params:Record<string,string|number>={}) {
  return copy.messages[key][i.language].replace(/\{(\w+)\}/g,(_,name:string)=>{
    if(params[name]===undefined)throw new Error(`Missing help parameter: ${name}`);
    return String(params[name]);
  });
}
/** GetLevelDescription @0x3602c; use the native catalog, including its named substitutions. */
export function classReward(i:I18n,classId:number,level:number):string {
  if(!Number.isInteger(level)||level<1||level>10)throw new RangeError('Class level must be 1..10');
  const c=getClass(classId);
  if(classId===0)return level===1?i.t('ui.native.072ed5de7186',{perk:i.t('perk.0.name'),flaw:i.t('flaw.0.name')}):helpCopy(i,'adventurerNote');
  if(level===1)return i.t('ui.native.60228c4e4fe1',{perk:i.t(`perk.${c.defaultPerk.value}.name`),flaw:i.t(`flaw.${c.defaultFlaw.value}.name`)});
  if(level===5)return i.t('ui.native.a7525fde80ca',{race:i.t(`race.${c.defaultRace.value}.name`)});
  if(level===10)return i.t('ui.native.e157c32bc71b',{skill:i.t(`skill.${c.baseSkillVector[0]!.value}.name`)});
  const keys:Record<number,string>={2:'f383409fa13c',3:'4c163801bf02',4:'2f0d10f6fd63',6:'de969c8433cc',7:'4c163801bf02',8:'d9ea891d14a3',9:'4c163801bf02'};
  return i.t(`ui.native.${keys[level]}`);
}
/** IsRaceUnlocked @0x248a0 uses the default race, independent of a class's edited race. */
export function raceRequirement(i:I18n,p:ProfileState,raceId:number):string {
  const owner=classData.classes.find(c=>c.defaultRace.value===raceId);
  if(!owner)throw new RangeError('Unknown race');
  if(owner.class.value===0)return helpCopy(i,'human');
  const level=p.classes[owner.class.value]!.level;
  return helpCopy(i,level>=classData.classLevelMilestones.changeRace?'raceOpen':'raceLocked',{
    race:i.t(`race.${raceId}.name`),class:i.t(`class.${owner.class.value}.name`),level,
  });
}
export function raceDetails(i:I18n,p:ProfileState,raceId:number):string {
  const race=getRace(raceId);
  return [i.t(`race.${raceId}.name`),raceRequirement(i,p,raceId),
    i.t('ui.native.384e66e6482b',{bonus:i.t(`race.${raceId}.racialBonusName`)}),i.t(`race.${raceId}.racialBonusDescription`),
    ...(raceId===0?[]:[i.t('ui.native.86965207a44e',{enemy:i.t(`enemy.${race.mortalEnemy.value}.name`)})]),
    i.t(`race.${raceId}.mortalEnemyDescription`)].join('\n\n');
}
