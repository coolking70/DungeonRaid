import {GameSession,SESSION_KEY} from '../../ui/session';
import {emptyTile} from '../../src/core/state';
export function tileArtFixture(kind='variants'){
 const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const session=new GameSession(storage);session.start({seed:42,classId:0,difficulty:1,mode:3});
 const s=session.state;s.board=s.board.map(t=>({...emptyTile(t.x,t.y),type:2,appearance:0}));
 if(kind==='variants'){
  [4,4,4,4,3,3,0,0,0,0,2,1].forEach((type,n)=>s.board[n]!.type=type);
  s.board[1]!.magicSword=true;s.board[2]!.arrow=true;s.board[3]!.broken=true;s.board[5]!.broken=true;
  s.board[7]!.mana=true;s.board[8]!.acid=true;s.board[9]!.explosive=true;
 }else{
  for(const n of [0,1,2])s.board[n]!.type=4;
  for(const n of [6,7,8])s.board[n]!.type=0;
 }
 s.skills=[25,31,16,29].map(id=>({id,level:1,cooldown:10,charge:10,active:false})) as typeof s.skills;s.selectedSkillCount=4;
 session.save();return data.get(SESSION_KEY)!;
}
