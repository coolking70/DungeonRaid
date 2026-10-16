// Isolated browser QA saves; no runtime debug mutation or user-profile changes.
import {GameSession,SESSION_KEY} from '../../ui/session';
import {updateEquipmentStats} from '../../src/core/equipment';
import {emptyTile,type MenuCandidate} from '../../src/core/state';
export function attributeFixtures(){
 const out:Record<string,string>={};
 for(const kind of ['level','upgrade','shop','stats'] as const){
  const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  const session=new GameSession(storage);session.profile.classes[8]!.level=1;session.start({seed:42,classId:8,difficulty:1,mode:3});
  const s=session.state;s.board=s.board.map(t=>({...emptyTile(t.x,t.y),type:2}));
  Object.assign(s.board[35]!,{type:1,health:10,maxHealth:10,attack:0,statsStatus:'ordinary'});
  s.skills[0]={id:1,level:1,cooldown:10,charge:3,active:false};
  s.selectedSkillCount=s.skills.filter(Boolean).length;
  s.character.perks=[1,3,5,7];s.character.flaws=[1,3,5,7];
  s.equipment[0]!.stats=Array.from({length:20},(_,id)=>[2,4,14].includes(id)?5:1);updateEquipmentStats(s);
  if(kind!=='stats'){
   let candidates:MenuCandidate[];
   if(kind==='level')candidates=[{kind:'stat',stat:0,id:42},{kind:'stat',stat:1,id:43},{kind:'stat',stat:7,id:49},{kind:'skill',skill:{...s.skills[0]!,level:2,cooldown:9}}];
   else if(kind==='upgrade')candidates=[6,3,14,19].map(stat=>({kind:'upgrade',itemType:s.equipment[0]!.type,stat,value:1}));
   else{
    const item=structuredClone(s.equipment[0]!);item.stats[6]=3;item.stats[2]=0;
    candidates=[{kind:'item',item,scroll:{id:1,level:1,cooldown:10,charge:10,active:false}},...s.equipment.slice(1,3).map(item=>({kind:'item' as const,item:structuredClone(item),scroll:null}))];
   }
   s.menus=[{id:s.nextEffectId++,kind,candidates,selected:[]}];s.phase='menu';s.inputReady=false;s.menuResumePhase='input';
  }
  session.save();out[kind]=data.get(SESSION_KEY)!;
 }
 return out;
}
