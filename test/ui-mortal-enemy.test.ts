import {expect,test} from 'vitest';
import {classData} from '../src/core/data';
import {step} from '../src/core/engine';
import {fixture,select,tile} from './turn-helpers';
import {I18n} from '../ui/i18n';
import {specialEnemyContent} from '../ui/content';
import runtime from '../ui/generated/runtime.json';

test.each([
 ['horizontal',[13,14,15],0],['upwards',[20,14,8],9],['downwards',[8,14,20],0],
 ['diagonal',[21,14,7],0],['start',[14,8,2],0],['end',[26,20,14],0],
] as const)('Dwarf vs Chaotic: %s preview and committed damage agree',(name,nodes,damage)=>{
 let s=fixture();s.character.race=2;s.base.damage=3;s.equipmentStats.damage=0;s.equipmentStats.weaponDamage=2;
 for(const slot of nodes)tile(s,slot,4);
 tile(s,14,1,{enemyType:14,health:100,maxHealth:100,defence:2,statsStatus:'special'});
 s=select(s,[...nodes]);expect(s.preview.valid).toBe(true);
 expect(s.preview.enemies.find(e=>e.slot===14)).toMatchObject({damage,healthLoss:Math.max(0,damage-2)});
 const r=step(s,{type:'CommitChain'});
 expect(r.events).toContainEqual(expect.objectContaining({type:'EnemyDamaged',slot:14,healthLoss:Math.max(0,damage-2),killed:false}));
});
test('Human can damage Chaotic with a horizontal chain',()=>{
 let s=fixture();s.character.race=0;s.base.damage=3;s.equipmentStats.damage=0;s.equipmentStats.weaponDamage=2;
 tile(s,13,4);tile(s,15,4);tile(s,14,1,{enemyType:14,health:100,maxHealth:100,defence:2,statsStatus:'special'});
 s=select(s,[13,14,15]);expect(s.preview.enemies[0]).toMatchObject({damage:7,healthLoss:5});
 expect(step(s,{type:'CommitChain'}).events).toContainEqual(expect.objectContaining({type:'EnemyDamaged',slot:14,healthLoss:5}));
});
test.each(['zh','en'] as const)('all nine races show only their own mortal enemy warning (%s)',locale=>{
 const i=new I18n({getItem:()=>null,setItem:()=>{}});i.install('en',runtime.en);i.install('zh',runtime.zh);i.installCatalog(runtime.catalog);i.setLanguage(locale);
 const s=fixture();
 for(const race of classData.races.filter(r=>r.race.value!==0)){
  s.character.race=race.race.value;
  const enemy=race.mortalEnemy.value,c=specialEnemyContent(i,s,enemy);
  expect(c.title).toBe(i.t('ui.enemy.mortal',{enemy:i.t(`enemy.${enemy}.name`)}));
  expect(c.lines).toContain(i.t(`race.${race.race.value}.mortalEnemyDescription`));
  const other=enemy===14?1:14;expect(specialEnemyContent(i,s,other).lines).toEqual([i.t(`enemy.${other}.desc`)]);
 }
 s.character.race=2;expect(specialEnemyContent(i,s,14).lines).toContain(i.t('race.2.racialBonusDescription'));
 s.character.race=0;expect(specialEnemyContent(i,s,14).title).toBe(i.t('enemy.14.name'));
});
