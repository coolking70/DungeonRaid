// Browser QA only: Warrior/Dwarf with a Chaotic surrounded by four sword tiles.
import {GameSession,SESSION_KEY} from '../../ui/session';
import {emptyTile} from '../../src/core/state';
export function chaoticFixture(){
 const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const s=new GameSession(storage);s.profile.classes[8]!.level=1;s.start({seed:42,classId:8,difficulty:1,mode:3});
 s.state.board=s.state.board.map(t=>({...emptyTile(t.x,t.y),type:2}));
 for(const slot of [8,13,15,20])s.state.board[slot]!.type=4;
 Object.assign(s.state.board[14]!,{type:1,enemyType:14,health:100,maxHealth:100,defence:2,attack:0,statsStatus:'special'});
 s.state.base.damage=3;s.state.equipmentStats.damage=0;s.state.equipmentStats.weaponDamage=2;
 s.save();return data.get(SESSION_KEY)!;
}
