import {expect,test} from 'vitest';
import {TileInspection} from '../ui/tile-inspection';
import {enemyStatusLines} from '../ui/content';
import {I18n} from '../ui/i18n';
import {GameSession} from '../ui/session';
import {fixture,tile,context,token} from './turn-helpers';
import {updateEquipmentStats} from '../src/core/equipment';
import {addResource,matchTile} from '../src/core/combat';
import {applyStatReward} from '../src/core/progression';
import {requestMenu} from '../src/core/menus';

test('stationary tap/hold permits inspection; dragging permanently cancels it even after backtracking',()=>{
 const g=new TileInspection();g.begin(27,105,0);g.move(30,108,0);expect(g.canShow([0])).toBe(true);
 g.move(80,105,1);expect(g.canShow([0,1])).toBe(false);
 g.move(27,105,0);expect(g.canShow([0])).toBe(false);
 g.begin(27,105,0);expect(g.canShow([0])).toBe(true);g.move(38,105,0);expect(g.canShow([0])).toBe(false);
 g.begin(27,105,0);g.move(55,105,null);expect(g.canShow([0])).toBe(false);
 g.reset();expect(g.canShow([0])).toBe(false);
});
test.each(['zh','en'] as const)('only active enemy status is shown (%s)',language=>{
 const i=new I18n({getItem:()=>null,setItem:()=>{}});i.setLanguage(language);
 const v={attack:2,defence:1,health:10,maxHealth:12,countdown:0,poison:[0,0,0]};
 expect(enemyStatusLines(i,v)).toHaveLength(2);
 expect(enemyStatusLines(i,{...v,poison:[0,2,3]})).toHaveLength(3);
 expect(enemyStatusLines(i,{...v,poison:[0,2,3]}).at(-1)).toContain('0 / 2 / 3');
 expect(enemyStatusLines(i,{...v,countdown:2})).toHaveLength(3);
});
function session(){const a=new GameSession({getItem:()=>null,setItem:()=>{}});a.state=fixture();a.timeline.reset(a.state);return a;}
function choose(a:GameSession){
 const m=a.state.menus[0]!,count=m.kind==='level'?2:1;
 for(let n=0;n<count;n++){a.skip();expect(a.dispatch({type:'SelectMenuItem',menuId:m.id,index:n})).toBe(true);}
 a.skip();expect(a.dispatch({type:'ConfirmMenu',menuId:m.id})).toBe(true);a.skip();
}
test.each(['level','upgrade'] as const)('%s menu opened outside a committed chain never creates an enemy turn',kind=>{
 const a=session();tile(a.state,35,1,{attack:5});requestMenu(a.state,kind,{...context(),rng:{randI:(lo)=>lo,rand:()=>0,randUnitF:()=>0}});
 a.timeline.reset(a.state);const before=a.state.turn;choose(a);
 expect(a.state.phase).toBe('input');expect(a.state.turn).toBe(before);
 expect(a.events.filter(e=>e.type==='EnemyAttack'||e.type==='TurnEnded')).toEqual([]);
});
test('one real shield chain suspends for multiple upgrades but produces exactly one enemy attack and turn end',()=>{
 const a=session(),s=a.state;s.base.maxHealth=s.health=500;s.base.bonusToken.shield=0;
 for(const item of s.equipment)item.stats.fill(0);
 s.equipment[0]!.stats[13]=8;updateEquipmentStats(s);s.resources.upgrade.remainder=98;s.current.shieldBoost=true;
 for(let n=0;n<35;n++)tile(s,n,3);tile(s,35,1,{attack:5,health:100,maxHealth:100});
 a.timeline.reset(s);
 const nodes=Array.from({length:6},(_,y)=>Array.from({length:6},(_,n)=>y*6+(y%2?5-n:n))).flat().filter(n=>n!==35);
 for(const slot of nodes){a.skip();expect(a.dispatch({type:'SelectTile',at:{x:slot%6,y:Math.floor(slot/6)}})).toBe(true);}
 expect(a.state.preview.valid).toBe(true);expect(a.dispatch({type:'CommitChain'})).toBe(true);a.skip();
 expect(a.state.phase).toBe('menu');expect(a.events.some(e=>e.type==='EnemyAttack')).toBe(false);
 let menus=0;while(a.state.phase==='menu'&&menus<10){expect(a.state.turn).toBe(0);choose(a);menus++;}
 expect(menus).toBeGreaterThanOrEqual(2);expect(a.state.phase).toBe('input');expect(a.state.turn).toBe(1);
 expect(a.events.filter(e=>e.type==='EnemyAttack')).toHaveLength(1);expect(a.events.filter(e=>e.type==='TurnEnded')).toHaveLength(1);
});
test.each([[0,2,'potion'],[1,0,'xp'],[2,3,'coin'],[3,1,'shield']] as const)('bonus type %s: +5 is percentage points, rolls only from fourth token, at 25 succeeds and 26 fails',(type,stat,key)=>{
 const s=fixture();applyStatReward(s,stat);expect(s.base.bonusToken[key]).toBe(25);
 for(let n=0;n<5;n++)tile(s,n,type);
 const c=context([25,26]);for(let n=0;n<3;n++)matchTile(s,n,c);
 expect(c.rng.calls).toHaveLength(0);expect(s.pending).toHaveLength(3);
 matchTile(s,3,c);expect(s.pending).toHaveLength(5);
 matchTile(s,4,c);expect(s.pending).toHaveLength(6);
 expect(c.rng.calls.map(r=>[r.a,r.b])).toEqual([[1,100],[1,100]]);
});
test('extra shield token repairs if armour is missing, otherwise it adds upgrade points',()=>{
 const s=fixture();s.armour=0;s.equipmentStats.maxArmour=1;s.base.repair=1;s.equipmentStats.repair=0;
 const c=context();addResource(s,token(3),c);expect(s.armour).toBe(1);expect(s.resources.upgrade.remainder).toBe(0);
 addResource(s,token(3),c);expect(s.resources.upgrade.remainder).toBe(2);
});
test('casting Enchant and confirming its upgrade is a free action with an enemy present',()=>{
 const a=session();tile(a.state,35,1,{attack:5});a.state.skills[0]={id:10,level:1,cooldown:10,charge:10,active:false};a.state.selectedSkillCount=1;a.timeline.reset(a.state);
 expect(a.dispatch({type:'CastSkill',slot:0,source:'manual'})).toBe(true);a.skip();expect(a.state.phase).toBe('menu');choose(a);
 expect(a.state.phase).toBe('input');expect(a.state.turn).toBe(0);expect(a.events.some(e=>e.type==='EnemyAttack'||e.type==='TurnEnded')).toBe(false);
});
test('an XP level earned by a kill chain pauses before the pending enemy attack, then resumes it once',()=>{
 const a=session(),s=a.state;s.base.damage=100;s.resources.xp.remainder=98;
 for(let n=0;n<3;n++)tile(s,n,1,{health:1,maxHealth:1,defence:0});tile(s,35,1,{health:200,maxHealth:200,attack:5});
 a.timeline.reset(s);
 for(let x=0;x<3;x++)expect(a.dispatch({type:'SelectTile',at:{x,y:0}})).toBe(true);
 expect(a.dispatch({type:'CommitChain'})).toBe(true);a.skip();expect(a.state.menus[0]!.kind).toBe('level');
 expect(a.state.turn).toBe(0);expect(a.events.some(e=>e.type==='EnemyAttack')).toBe(false);
 choose(a);expect(a.state.turn).toBe(1);expect(a.events.filter(e=>e.type==='EnemyAttack')).toHaveLength(1);expect(a.events.filter(e=>e.type==='TurnEnded')).toHaveLength(1);
});
