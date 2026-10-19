import {expect,test} from 'vitest';
import {fixture} from './turn-helpers';
import {I18n} from '../ui/i18n';
import runtime from '../ui/generated/runtime.json';
import {candidateContent,characterContent,equipmentLines,itemStatValue,statRewardLines,statsRows} from '../ui/content';
import {Tooltip} from '../ui/widgets';
import {measureText,loadInputs} from '../tools/i18n/check.mjs';
const font=loadInputs().font;
function i18n(locale:'en'|'zh'){
 const i=new I18n({getItem:()=>null,setItem:()=>{}});i.install('en',runtime.en);i.install('zh',runtime.zh);i.installCatalog(runtime.catalog);i.setLanguage(locale);return i;
}
test.each(['en','zh'] as const)('all upgrade descriptions and actual units render in %s',locale=>{
 const i=i18n(locale),s=fixture();
 for(let id=0;id<20;id++){
  s.equipment[0]!.stats[id]=1;
  const c=candidateContent(i,{kind:'upgrade',itemType:s.equipment[0]!.type,stat:id,value:1},s);
  expect(c.lines[0]).toBe(i.t(`item.upgrade.${id}.desc`));
  expect(c.lines[1]).toBe(`${itemStatValue(id,1)} >> ${itemStatValue(id,2)}`);
  const detail=equipmentLines(i,s.equipment[0]!);expect(detail.join('')).not.toMatch(/\{\w+\}|ui\.native\.|item\.upgrade/);
  if(locale==='zh')expect(detail.join('')).not.toMatch(/[A-Za-z]/);
  expect(()=>measureText(detail.join('')+c.lines.join(''),font)).not.toThrow();
 }
 const c=candidateContent(i,{kind:'item',item:s.equipment[0]!,scroll:null},s);expect(c.lines.join('')).toContain(i.source('Replaces: {skill}',{skill:c.title}));
});
test('quarter units and percentages are distinct; zero-valued removed bonuses remain visible',()=>{
 expect([1,2,3,4].map(n=>itemStatValue(6,n))).toEqual(['0.25','0.5','0.75','1']);
 expect(itemStatValue(2,5)).toBe('5%');
 const s=fixture(),old=structuredClone(s.equipment[0]!);old.stats[6]=3;
 expect(equipmentLines(i18n('en'),s.equipment[0]!,old).join('')).toContain('+0 Experience points per skull (0.75 >> 0)');
});
test('level rewards show native base comparisons, chance meaning and capped probabilities without mutation',()=>{
 const s=fixture(),i=i18n('en');s.base.bonusToken.xp=98;s.equipmentStats.damage=50;
 const before=structuredClone(s);
 expect(statRewardLines(i,0,s)).toEqual([`Base dmg: ${s.base.damage} >> ${s.base.damage+1}`,'Chance of bonus XP: 98% >> 100%']);
 expect(statRewardLines(i,1,s)[0]).toContain('Armour per shield:');
 expect(statRewardLines(i,3,s)[0]).toContain('Health per potion:');
 expect(statRewardLines(i,7,s)).toHaveLength(4);
 for(let n=0;n<8;n++)expect(statRewardLines(i,n,s).length).toBeGreaterThan(0);
 expect(s).toEqual(before);
 s.base.bonusToken.xp=100;expect(statRewardLines(i,0,s)[1]).toBe('Chance of bonus XP: 100%');
});
test('Pretzel omits HP from vitality and retains original special upgrade description',()=>{
 const i=i18n('en'),s=fixture();s.mode=1;s.challenge=true;
 expect(statRewardLines(i,2,s)).toHaveLength(1);
 expect(candidateContent(i,{kind:'upgrade',itemType:0,stat:19,value:1},s).lines[0]).toBe('(+5% bonus potion)');
 s.challenge=false;expect(statRewardLines(i,2,s)).toHaveLength(2);
});
test('skill rewards explain cooldown changes; permanent skills have no cooldown line',()=>{
 const i=i18n('en'),s=fixture();const skill={id:1,level:2,cooldown:9,charge:2,active:false};s.skills[0]={...skill,level:1,cooldown:10};
 expect(candidateContent(i,{kind:'skill',skill},s).lines).toContain('Cooldown: 10>>9');
 s.skills[0]=null;expect(candidateContent(i,{kind:'skill',skill},s).lines).toContain('Cooldown: 9');
 expect(candidateContent(i,{kind:'skill',skill:{...skill,cooldown:-1}},s).lines).toHaveLength(1);
});
test('stats restore all 17 original rows, percentage display caps, equipment highlight, active character details',()=>{
 const i=i18n('en'),s=fixture();s.base.bonusToken.xp=99;s.equipmentStats.bonusToken.xp=10;s.equipmentStats.pierceThreshold=65;s.equipmentStats.breakThreshold=30;
 const rows=statsRows(i,s);expect(rows).toHaveLength(18);
 expect(rows[3]).toMatchObject({value:'100%',boosted:true});expect(rows[14]!.value).toBe('65%');expect(rows[16]!.value).toBe('70%');
 s.character.race=2;s.character.perks=[1,3,255,255];s.character.flaws=[2,255,255,255];
 expect(characterContent(i,s).lines).toEqual([i.t('race.2.racialBonusDescription'),i.t('perk.1.desc'),i.t('perk.3.desc'),i.t('flaw.2.desc')]);
});
test('long tooltip preserves all lines in pages and consumes both ends of page clicks',()=>{
 const drawn:string[]=[],ctx=new Proxy({measureText:(s:string)=>({width:measureText(s,font)})},{get:(o,k)=>k==='fillText'?(s:string)=>drawn.push(s):k in o?o[k as keyof typeof o]:()=>{},set:()=>true}) as unknown as CanvasRenderingContext2D;
 const tooltip=new Tooltip();tooltip.show('Details',Array.from({length:40},(_,n)=>`Line ${n}`),300,450);tooltip.update(1);
 const draw=()=>tooltip.draw(ctx,{ui:{paint:()=>{}}} as never);draw();expect(tooltip.pages).toBe(3);
 for(let n=0;n<2;n++){const next=tooltip.controls[1]!;expect(tooltip.input({type:'down',x:next.x+3,y:next.y+3})).toBe(true);expect(tooltip.input({type:'up',x:next.x+3,y:next.y+3})).toBe(true);draw();}
 for(let n=0;n<40;n++)expect(drawn).toContain(`Line ${n}`);
 expect(tooltip.input({type:'down',x:-1,y:-1})).toBe(false);
 tooltip.show('New',[],0,0);expect(tooltip.page).toBe(0);
});
