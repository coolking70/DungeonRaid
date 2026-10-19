// Isolated QA saves; never touch the player's browser profile.
import {GameSession,SESSION_KEY} from '../../ui/session';
import {emptyTile} from '../../src/core/state';
import {GameMode} from '../../src/core/data';
export function trophyFixture(kind='normal'){
 const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const session=new GameSession(storage);session.start({seed:12345,classId:0,difficulty:1,mode:3});
 const s=session.state;s.board=s.board.map(t=>({...emptyTile(t.x,t.y),type:2}));
 for(const slot of [12,13])s.board[slot]!.type=4;
 Object.assign(s.board[14]!,{type:1,enemyType:1,health:1,maxHealth:1,defence:0,attack:0,statsStatus:'special'});
 s.trophies.remaining=2;
 if(kind==='fresh')s.trophies.remaining=0;
 if(kind==='sprint'){s.challenge=true;s.mode=GameMode.MODE_SPRINT;s.trophies.remaining=12;}
 if(kind==='easy')s.difficulty=0;
 if(kind==='limit')s.trophies.awarded=3;
 if(kind==='complete'){s.classLevels.fill(10);session.profile.classes.forEach(c=>c.level=10);}
 session.save();return data.get(SESSION_KEY)!;
}
