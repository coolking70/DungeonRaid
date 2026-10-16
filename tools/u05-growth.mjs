// Actual fixed-seed 100-turn Classic game, with an explicit survival-only HP fixture.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try {
 const {GameMode}=await server.ssrLoadModule('/src/core/data.ts');
 const {step}=await server.ssrLoadModule('/src/core/engine.ts');
 const {createRunState,emptyTile}=await server.ssrLoadModule('/src/core/state.ts');
 const {nextAction}=await server.ssrLoadModule('/test/turn-helpers.ts');
 const {adjacent,canMatchType}=await server.ssrLoadModule('/src/core/chain.ts');
 const {canCastSkill}=await server.ssrLoadModule('/src/core/skills.ts');
 const {generateStats}=await server.ssrLoadModule('/src/core/board.ts');
 const {NativeRng}=await server.ssrLoadModule('/src/core/rng.ts');
 const hooks={scrollNativeWord:()=>0};
 let s=step(createRunState({scrollFilter:'supplied-native-fixture'}),{type:'NewGame',seed:12345,classId:0,difficulty:1,mode:GameMode.MODE_CLASSIC},hooks).state;
 s.base.maxHealth=100000;s.equipmentStats.maxHealth=0;s.health=100000;
 const births=[],snapshots=[];
 function act(action){const r=step(s,action,hooks);s=r.state;if(r.events.some(e=>e.type==='TileGenerated'))for(const m of s.moving.filter(m=>m.spawned)){const t=s.board[m.slot];if(t.type===1&&t.enemyType===0)births.push({turn:s.turn,slot:m.slot,attack:t.attack,defence:t.defence,health:t.health});}}

 function drain(){let n=0;while(!['input','ended'].includes(s.phase)){assert(++n<3000);act(nextAction(s));}}
 while(s.turn<100&&s.phase!=='ended'){
  let free=0;while(s.phase==='input'){
   assert(++free<100);const trophy=s.board.findIndex(t=>t.specialType===1&&!t.frozen&&!t.matched),skill=s.skills.findIndex((_,i)=>canCastSkill(s,i));
   if(trophy>=0)act({type:'ClaimTrophy',slot:trophy});else if(skill>=0)act({type:'CastSkill',slot:skill,source:'manual'});else break;drain();
  }
  let best=[];for(let first=0;first<36;first++){if(!canMatchType(s,first,[]))continue;const path=[first];for(;;){const n=s.board.findIndex((t,i)=>!path.includes(i)&&adjacent(t,s.board[path.at(-1)])&&canMatchType(s,i,path));if(n<0)break;path.push(n);}if(path.length>best.length)best=path;}
  assert(best.length>=3);for(const slot of best)act({type:'ExtendChain',at:{x:slot%6,y:Math.floor(slot/6)}});act({type:'CommitChain'});drain();
  if([10,50,100].includes(s.turn)){
   // Probe a private copy at precisely this completed turn, without advancing live RNG.
   const probe=structuredClone(s),rng=new NativeRng(probe.rng),samples=[];
   for(let i=0;i<100;i++){const t={...emptyTile(0,0),type:1};generateStats(probe,t,rng);samples.push([t.attack,t.defence,t.health]);}
   snapshots.push({turn:s.turn,birthsDuringCompletedTurn:births.filter(b=>b.turn===s.turn-1),probe100:{attack:[Math.min(...samples.map(t=>t[0])),Math.max(...samples.map(t=>t[0]))],defence:[Math.min(...samples.map(t=>t[1])),Math.max(...samples.map(t=>t[1]))],health:[Math.min(...samples.map(t=>t[2])),Math.max(...samples.map(t=>t[2]))]}});
  }
 }
 assert.equal(s.turn,100);assert.equal(snapshots.length,3);
 const result={seed:12345,difficulty:1,mode:GameMode.MODE_CLASSIC,survivalFixture:'Initial HP/maxHP=100000 only; no subsequent HP/state edits. Probe samples on private copies.',turn:s.turn,snapshots,births};writeFileSync('docs/tasks/U05.growth.json',JSON.stringify(result,null,2));console.log(JSON.stringify(snapshots,null,2));
} finally {await server.close();}
