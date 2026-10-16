import { describe, expect, it } from 'vitest';
import { classData } from '../src/core/data';
import { activateSkill } from '../src/core/skills';
import { initialiseSkill } from '../src/core/progression';
import { growthContext } from './growth-helpers';
import { createProfileState, createRunState } from '../src/core/state';
import { I18n } from '../ui/i18n';
import en from '../data/i18n/en.json';
import zh from '../data/i18n/zh.json';
import catalog from '../data/i18n/catalog.json';
import copy from '../ui/help-copy.json';
import { classReward, helpCopy, raceRequirement } from '../ui/progression-help';
import { CharacterEditor } from '../ui/front-model';
import { drawTutorialExample, tutorialExample } from '../ui/tutorial-examples';
import { wrap } from '../ui/widgets';
import { loadInputs, measureText } from '../tools/i18n/check.mjs';
import type { Assets } from '../ui/assets';

function language(locale:'zh'|'en') {
  const i=new I18n({getItem:()=>null,setItem:()=>{}});i.install('en',en);i.install('zh',zh);i.installCatalog(catalog);i.setLanguage(locale);return i;
}
const font=loadInputs().font;
const context=()=>new Proxy({measureText:(value:string)=>({width:measureText(value,font)}),createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k as keyof typeof o]:()=>{},set:()=>true}) as unknown as CanvasRenderingContext2D;

describe('U07 native class rewards and race explanations',()=>{
  it.each(['zh','en'] as const)('substitutes the native rewards for every class and level (%s)',locale=>{
    const i=language(locale);
    for(const c of classData.classes.slice(1)) {
      const id=c.class.value;
      expect(classReward(i,id,1)).toContain(i.t(`perk.${c.defaultPerk.value}.name`));
      expect(classReward(i,id,1)).toContain(i.t(`flaw.${c.defaultFlaw.value}.name`));
      expect(classReward(i,id,5)).toContain(i.t(`race.${c.defaultRace.value}.name`));
      expect(classReward(i,id,10)).toContain(i.t(`skill.${c.baseSkillVector[0]!.value}.name`));
      for(let level=1;level<=10;level++) {
        const text=classReward(i,id,level);
        expect(text).not.toMatch(/\{|ui\./);
        expect(wrap(context(),text,268).length).toBeLessThanOrEqual(8);
        if(level%2===0)expect(text).toContain(String(classData.classLevelMilestones.replacementCountsByLevel[level]));
      }
    }
    expect(classReward(i,0,5)).toBe(helpCopy(i,'adventurerNote'));
    expect(()=>classReward(i,1,11)).toThrow(RangeError);
  });
  it('explains both race gates at level 4/5 without changing a locked class or its edited race',()=>{
    const p=createProfileState(),i=language('en');
    for(const c of classData.classes.slice(1)) {
      const id=c.class.value,race=c.defaultRace.value;
      p.classes[id]!.level=4;p.classes[id]!.race=0;
      expect(raceRequirement(i,p,race)).toContain('(now 4/5)');
      expect(raceRequirement(i,p,race)).toContain(i.t(`class.${id}.name`));
      p.classes[id]!.level=5;
      expect(raceRequirement(i,p,race)).toContain('is available');
    }
    p.classes[1]!.level=4;
    const before=structuredClone(p),e=new CharacterEditor(p,1);
    expect(e.setRace(0)).toBe(false);
    raceRequirement(i,p,1);classReward(i,1,10);
    expect(p).toEqual(before);
    expect(raceRequirement(i,p,0)).toBe('Human is always available.');
  });
});
describe('U07 runtime tutorial illustrations',()=>{
  it.each(['zh','en'] as const)('renders every page through supplied live assets with room for body and controls (%s)',locale=>{
    const i=language(locale),ctx=context();
    for(let page=0;page<23;page++) {
      const calls:string[]=[];
      const a={tile:()=>calls.push('tile'),ui:{paint:(_:unknown,id:string)=>calls.push(id),fill:(_:unknown,id:string)=>calls.push(id)},items:{draw:()=>calls.push('item')}} as unknown as Assets;
      drawTutorialExample(ctx,a,i,page);
      expect(calls.some(id=>id!=='ui.panel')).toBe(true);
      const caption=helpCopy(i,tutorialExample(page).caption);
      expect(wrap(ctx,caption,248).length).toBeLessThanOrEqual(2);
      const body=page===0?helpCopy(i,'tutorialStart'):i.t(`ui.help.${page}`);
      expect(278+(wrap(ctx,body,268).length-1)*14).toBeLessThan(382);
    }
  });
  it('uses a turn-duration skill for the active-skill illustration, not an instant heal',()=>{
    const state=createRunState(),context=growthContext([]);
    const skill=initialiseSkill(state,tutorialExample(20).skill!);
    activateSkill(state,skill,context);
    expect(skill.active).toBe(true);
    expect(Object.values(state.current).some(Boolean)).toBe(true);
  });
  it('has matching bilingual placeholders and font glyphs for all added UI copy',()=>{
    for(const entry of Object.values(copy.messages)) {
      expect(entry.zh.match(/\{\w+\}/g)).toEqual(entry.en.match(/\{\w+\}/g));
      expect(()=>measureText(entry.zh+entry.en,font)).not.toThrow();
    }
  });
});
