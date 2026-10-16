import { enumValue } from '../src/core/data';
import { expect, test, vi } from 'vitest';
import { GameSession } from '../ui/session';
import { PresentationTimeline } from '../ui/timeline';
import { boardState, enemyView } from '../ui/board-view';
import { SilentAudio } from '../ui/audio';
import { fixture, tile, token, context } from './turn-helpers';
import { serializeRun } from '../src/core/save';
import { attackSkull, enemyId, processAttack } from '../src/core/combat';
import { activateAbility } from '../src/core/specials';
import { enemyPoison } from '../src/core/turn';
import { commitChain } from '../src/core/chain';
import type { RngCall } from '../src/core/rng';
import type { RunState } from '../src/core/state';
function session(s: RunState) {
  const data=new Map([['dungeonraid.run.v1',serializeRun(s).json]]);
  return new GameSession({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});
}
function play(a: GameSession) { for(let n=0;a.busy&&n<2000;n++)a.update(1/60);expect(a.busy).toBe(false); }
const chain=Array.from({length:25},(_,i)=>Math.floor(i/6)*6+(Math.floor(i/6)%2?5-i%6:i%6));
test.each(['long','kill','menu','death','poison'] as const)('skip/%s: byte-identical RunState, FIFO effects, full RNG tape and menu continuation',kind=>{
  const s=fixture();if(kind==='menu')s.resources.gold.remainder=99;
  if(kind==='kill'){tile(s,0,4);tile(s,1,4);tile(s,2,1,{health:1});}
  if(kind==='death'){s.health=1;s.armour=0;tile(s,35,1,{attack:100});}
  if(kind==='poison')tile(s,35,1,{health:30,poison:[2,3,4]});
  const a=session(s),b=session(s),ar:RngCall[]=[],br:RngCall[]=[];
  b.setAnimationSpeed('fast');a.onRng=c=>ar.push({...c});b.onRng=c=>br.push({...c});
  for(const run of [a,b]){for(const slot of chain.slice(0,kind==='long'?25:3))expect(run.dispatch({type:'SelectTile',at:{x:slot%6,y:Math.floor(slot/6)}})).toBe(true);expect(run.dispatch({type:'CommitChain'})).toBe(true);}
  play(a);b.update(1/60);expect(b.skip()).toBe(true);
  const equal=()=>{expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));expect(JSON.stringify(br)).toBe(JSON.stringify(ar));expect(b.events).toEqual(a.events);expect(b.timeline.display.board).toEqual(a.timeline.display.board);};equal();expect(ar.length).toBeGreaterThan(0);
  expect(b.timeline.tokens).toEqual([]);expect(b.timeline.visuals).toEqual([]);
  if(kind==='menu'){
    expect(b.state.phase).toBe('menu');expect(b.state.pending.length).toBeGreaterThan(0);
    for(let i=0;i<10&&a.state.phase==='menu';i++){
      for(const run of [a,b]){const m=run.state.menus[0]!;for(let j=0;j<(m.kind==='level'?2:1);j++)run.dispatch({type:'SelectMenuItem',menuId:m.id,index:j});run.dispatch({type:'ConfirmMenu',menuId:m.id});}
      play(a);b.skip();equal();
    }
  }
});
test('one sound per ID during skip; active and unlaunched animations finish; paused skip does nothing',()=>{
  const s=fixture(),audio=new SilentAudio(),spy=vi.spyOn(audio,'play'),tl=new PresentationTimeline(s,audio);
  const effects=[1,2,3].map(id=>token(2,{id,targetSlot:id}));
  tl.enqueue(s,s,effects.map(effect=>({type:'EffectQueued',effect})));
  for(const e of effects)tl.enqueue(s,s,[{type:'EffectConsumed',id:e.id}]);
  tl.paused=true;tl.finish();expect(tl.busy).toBe(true);tl.paused=false;tl.finish();expect(tl.busy).toBe(false);expect(spy).toHaveBeenCalledExactlyOnceWith(2,-1);tl.finish();expect(spy).toHaveBeenCalledOnce();
});
test('25 tokens launch together and finish in bounded time; fast is optional and persistent',()=>{
 const a=session(fixture());for(const slot of chain)a.dispatch({type:'SelectTile',at:{x:slot%6,y:Math.floor(slot/6)}});a.dispatch({type:'CommitChain'});a.update(1/60);expect(a.timeline.tokens.length).toBeGreaterThanOrEqual(25);
 let frames=1;while(a.busy&&frames<180){a.update(1/60);frames++;}expect(frames).toBeLessThan(120);
 a.setAnimationSpeed('fast');const b=new GameSession(a.storage);expect(b.timeline.speed).toBe('fast');
});
test.each(['damage','poison','countdown','healer','vengeful','vampire'] as const)('current board snapshot immediately reflects actual %s rule operation',kind=>{
 const s=fixture();tile(s,0,1,{health:12,maxHealth:30,attack:4});
 if(kind==='countdown')Object.assign(s.board[0]!,{enemyType:enemyId('KAMIKAZE'),countdown:3});
 if(kind==='poison')s.board[0]!.poison=[2,3,4];
 if(kind==='healer')tile(s,14,1,{enemyType:enemyId('HEALER')});
 if(kind==='vampire'){s.board[0]!.enemyType=enemyId('VAMPIRE');s.armour=0;}
 if(kind==='vengeful'){s.board[0]!.enemyType=enemyId('VENGEFUL');for(const n of [1,2,3])tile(s,n,1,{health:1});s.chain.nodes=[1,2,3];s.base.damage=10;}
 const before=structuredClone(s),c=context(Array(100).fill(0));
 if(kind==='damage')attackSkull(s,0,3,true,c);
 if(kind==='poison')enemyPoison(s,c);
 if(kind==='countdown')activateAbility(s,0,c);
 if(kind==='healer')activateAbility(s,14,c);
 if(kind==='vampire')processAttack(s,c);
 if(kind==='vengeful')commitChain(s,c);
 const tl=new PresentationTimeline(before);tl.enqueue(before,s,c.events);const v=enemyView(boardState(tl),0);
 expect(v.health).toBe(s.board[0]!.health);expect(v.attack).toBe(s.board[0]!.attack);expect(v.countdown).toBe(s.board[0]!.countdown);expect(v.poison).toEqual(s.board[0]!.poison);
 expect(v).not.toEqual(enemyView(before,0));
 if(kind==='countdown')expect(v.countdown).toBe(2);
});

test('enemy view uses effective Elf poison attack and hides phylactery numeric labels',()=>{
 const s=fixture();tile(s,0,1,{attack:8,poison:[1,1,1]});
 s.character.race=enumValue('RaceType','RACE_ELF');expect(enemyView(s,0).attack).toBe(4);
 s.board[0]!.enemyType=enemyId('LICH');s.board[0]!.countdown=1;expect(enemyView(s,0).phylactery).toBe(true);
});
