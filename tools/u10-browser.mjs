import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U10_OUT??'/tmp/U10-browser',url=process.env.U10_URL??'http://127.0.0.1:5318';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=2000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function point(p,x,y){const {viewport:v}=await snap(p);return{x:v.x+x*v.width/320,y:v.y+y*v.height/480};}
async function click(p,id){const b=(await snap(p)).buttons.find(b=>b.id===id);assert(b?.enabled);const pos=await point(p,b.x+b.w/2,b.y+b.h/2);await p.mouse.click(pos.x,pos.y);await advance(p);}
async function shot(p,name){const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
async function load(p){await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'continue');}
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await source.waitForFunction(()=>!!window.advanceTime);
 const fixture=await source.evaluate(async root=>(await import(`/@fs${root}/docs/tasks/U10.fixtures.ts`)).chaoticFixture(),process.cwd());await source.close();
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const language of ['zh','en']){
  const c=await browser.newContext({viewport,hasTouch:device==='mobile'}),p=await c.newPage();
  await c.addInitScript(({fixture,language})=>{localStorage.setItem('dungeonraid.session.v2',fixture);localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));},{fixture,language});
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});await load(p);
  const pos=await point(p,133.5,211.5);
  if(device==='mobile')await p.touchscreen.tap(pos.x,pos.y);else{await p.mouse.move(pos.x,pos.y);await p.mouse.down();await advance(p,800);await p.mouse.up();}
  await advance(p,300);const tooltip=(await snap(p)).tooltip;
  assert(tooltip.title.includes(language==='zh'?'宿敌':'Mortal Enemy'));assert(tooltip.body.some(s=>s.includes(language==='zh'?'从其下方':'tile under')));await shot(p,`${device}-${language}-tooltip`);
  for(const [name,nodes,damage] of [['horizontal',[13,14,15],0],['uppercut',[20,14,8],7]]){
   await load(p);
   for(const [index,slot] of nodes.entries()){const pt=await point(p,27.5+slot%6*53,79+(Math.floor(slot/6)+.5)*53);await p.mouse.move(pt.x,pt.y,{steps:5});if(index===0)await p.mouse.down();}
   const s=await p.evaluate(()=>window.__dr.state);assert.equal(s.preview.enemies.find(e=>e.slot===14).healthLoss,damage);await advance(p,16);await shot(p,`${device}-${language}-${name}-preview`);
   await p.mouse.up();await advance(p,15000);const events=await p.evaluate(()=>window.__dr.events);
   assert(events.some(e=>e.type==='EnemyDamaged'&&e.slot===14&&e.healthLoss===damage));await shot(p,`${device}-${language}-${name}-after`);
  }
  results.push({device,language,mortalWarning:true,uppercutInstructions:true,horizontalDamage:0,uppercutDamage:7});await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
