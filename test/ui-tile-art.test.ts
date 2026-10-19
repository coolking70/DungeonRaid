import {expect,test} from 'vitest';
import {emptyTile} from '../src/core/state';
import {tileUV,drawBoard} from '../ui/board-view';
import {PresentationTimeline} from '../ui/timeline';
import {GameSession} from '../ui/session';
import {tileArtFixture} from '../docs/tasks/U14.fixtures';
import {fixture} from './turn-helpers';
function session(kind:string){const data=new Map([['dungeonraid.session.v2',tileArtFixture(kind)]]);return new GameSession({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});}
test('native tile UV covers full arrow, broken sword/shield and all eight potion variants',()=>{
 const t=emptyTile(0,0);t.type=4;t.appearance=7;
 expect(tileUV(t)).toEqual({x:371,y:212});t.magicSword=true;expect(tileUV(t)).toEqual({x:371,y:212});
 t.magicSword=false;t.broken=true;expect(tileUV(t)).toEqual({x:424,y:778});
 t.arrow=true;expect(tileUV(t)).toEqual({x:565,y:459}); // CreateArrows also converts broken swords, leaving their damage flag unchanged.
 t.type=3;expect(tileUV(t)).toEqual({x:424,y:725});
 for(const [flag,y] of [['mana',513],['acid',566],['explosive',619]] as const)for(let n=0;n<8;n++){
  const p=emptyTile(0,0);p.type=0;p.appearance=n;p[flag]=true;expect(tileUV(p)).toEqual({x:n*53,y});
 }
});
test('board requests native blue tint and full-opacity broken sprite; no legacy symbolic markers',()=>{
 const s=fixture();s.board[0]!.type=4;s.board[0]!.magicSword=true;s.board[1]!.type=3;s.board[1]!.broken=true;
 const calls:unknown[][]=[],texts:string[]=[];
 const ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k==='fillText'?(v:string)=>texts.push(v):k in o?o[k as keyof typeof o]:()=>{},set:(o,k,v)=>{Reflect.set(o,k,v);return true;}}) as unknown as CanvasRenderingContext2D;
 drawBoard(ctx,s,new PresentationTimeline(s),{tile:(...args:unknown[])=>calls.push([...args,ctx.globalAlpha]),ui:{paint:()=>{}}} as never);
 expect(calls[0]!.slice(1)).toEqual([0,212,1,79,53,true,1]);
 expect(calls[1]!.slice(1)).toEqual([424,725,54,79,53,false,1]);expect(texts).not.toContain('+');
});
test('real magic/volley/mana casts update visible variants, survive reload, and boost expires after a turn',()=>{
 const a=session('skills');a.resume();a.skip();
 for(const slot of [0,1,2,3]){expect(a.dispatch({type:'CastSkill',slot,source:'manual'})).toBe(true);a.skip();}
 expect(a.state.board.filter(t=>t.magicSword)).toHaveLength(1);
 expect(a.state.board.filter(t=>t.arrow)).toHaveLength(2);
 expect(a.state.board.filter(t=>t.mana)).toHaveLength(3);
 expect(a.state.skills[2]!.active).toBe(true);expect(a.state.current.swordBoost).toBe(true);
 const b=new GameSession(a.storage);b.resume();b.skip();expect(b.state.board.map(tileUV)).toEqual(a.state.board.map(tileUV));
 for(const slot of [30,31,32])b.dispatch({type:'SelectTile',at:{x:slot%6,y:Math.floor(slot/6)}});
 expect(b.dispatch({type:'CommitChain'})).toBe(true);b.skip();expect(b.state.skills[2]!.active).toBe(false);expect(b.state.current.swordBoost).toBe(false);
});
