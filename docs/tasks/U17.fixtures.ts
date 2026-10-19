import {GameSession,SESSION_KEY} from '../../ui/session';
import {emptyTile} from '../../src/core/state';
export function hudLayoutFixture(large=false,mode=3){
 const data=new Map<string,string>(),session=new GameSession({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});
 session.start({seed:42,classId:8,difficulty:1,mode});const s=session.state;
 s.turn=large?12345:81;s.level=large?99:2;s.resources.gold.banked=large?99999900:600;s.resources.gold.remainder=54;
 s.board=s.board.map(t=>({...emptyTile(t.x,t.y),type:2,appearance:0}));
 for(const [slot,attack,defence,health,enemyType,countdown] of [[0,1,2,4,0,0],[6,12,10,120,0,0],[12,99,0,999,0,0],[18,1,1,4,0,0],[4,2,3,40,3,3],[10,2,3,40,10,3],[16,2,3,40,19,3],[22,2,3,40,28,3],[28,2,3,40,32,1]]){
  Object.assign(s.board[slot!]!,{type:1,attack,defence,health,maxHealth:health,enemyType,countdown,statsStatus:'ordinary'});
 }
 session.save();return data.get(SESSION_KEY)!;
}
