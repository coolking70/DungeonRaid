// Isolated UI regression fixtures for stationary inspection versus chain gestures.
import {GameSession,SESSION_KEY} from '../../ui/session';
import {emptyTile} from '../../src/core/state';
export function inspectionFixture(poison=false){
 const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const session=new GameSession(storage);session.start({seed:42,classId:0,difficulty:1,mode:3});
 const s=session.state;s.board=s.board.map(t=>({...emptyTile(t.x,t.y),type:2}));
 for(const slot of [13,15,20])s.board[slot]!.type=4;
 Object.assign(s.board[14]!,{type:1,enemyType:14,health:100,maxHealth:100,defence:2,attack:2,statsStatus:'special',poison:poison?[3,2,1]:[0,0,0]});
 session.save();return data.get(SESSION_KEY)!;
}
