import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U12_OUT??'/tmp/U12-browser',url=process.env.U12_URL??'http://127.0.0.1:5318';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=1000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function point(p,x,y){const {viewport:v}=await snap(p);return{x:v.x+x*v.width/320,y:v.y+y*v.height/480};}
async function shot(p,name){const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await source.waitForFunction(()=>!!window.advanceTime);
 const fixtures=await source.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U12.fixtures.ts`);return [m.inspectionFixture(),m.inspectionFixture(true)];},process.cwd());await source.close();
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const language of ['zh','en']){
  const touch=device==='mobile',c=await browser.newContext({viewport,hasTouch:touch}),p=await c.newPage(),cdp=await c.newCDPSession(p);
  await p.addInitScript(({language,fixtures})=>{localStorage.setItem('dungeonraid.session.v2',fixtures[Number(localStorage.getItem('u12.poison')==='true')]);localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));},{language,fixtures});
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  async function load(poison=false){await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await p.evaluate(flag=>localStorage.setItem('u12.poison',String(flag)),poison);await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p,2000);const b=(await snap(p)).buttons.find(b=>b.id==='continue');const pt=await point(p,b.x+b.w/2,b.y+b.h/2);await p.mouse.click(pt.x,pt.y);await advance(p,2000);}
  async function pointer(type,slot){const pt=await point(p,27.5+(slot%6)*53,79+(Math.floor(slot/6)+.5)*53);
   if(touch)await cdp.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{...pt,id:1}]});
   else{if(type!=='up')await p.mouse.move(pt.x,pt.y);if(type==='down')await p.mouse.down();if(type==='up')await p.mouse.up();}
   await p.evaluate(()=>new Promise(requestAnimationFrame));
  }
  await load();await pointer('down',0);await pointer('move',1);await advance(p,900);assert.equal((await snap(p)).tooltip.showing,false);
  await pointer('move',2);await advance(p,900);assert.equal((await snap(p)).tooltip.showing,false);assert.equal((await p.evaluate(()=>window.__dr.state)).preview.valid,true,JSON.stringify(await p.evaluate(()=>({chain:window.__dr.state.chain,phase:window.__dr.state.phase,events:window.__dr.events.slice(-5)}))));await shot(p,`${device}-${language}-paused-chain`);
  await pointer('up',2);await advance(p,18000);assert.equal((await snap(p)).tooltip.showing,false);assert.equal((await p.evaluate(()=>window.__dr.state)).turn,1);
  await load();await pointer('down',14);await advance(p,800);let tip=(await snap(p)).tooltip;assert.equal(tip.showing,true);assert(!tip.body.some(s=>s.includes(language==='zh'?'中毒':'Poison (')));assert(!tip.body.some(s=>s.includes(language==='zh'?'倒计时':'countdown')));await shot(p,`${device}-${language}-clean-enemy`);
  await pointer('move',13);await advance(p,900);assert.equal((await snap(p)).tooltip.showing,false);
  await pointer('move',14);await advance(p,900);assert.equal((await snap(p)).tooltip.showing,false);await pointer('up',14);await advance(p);assert.equal((await snap(p)).tooltip.showing,false);assert.equal((await p.evaluate(()=>window.__dr.state)).turn,0);
  await load(true);await pointer('down',14);await advance(p,800);tip=(await snap(p)).tooltip;assert(tip.body.some(s=>s.includes('3 / 2 / 1')));await shot(p,`${device}-${language}-poisoned-enemy`);await pointer('up',14);
  results.push({device,language,dragPauseNoTooltip:true,backtrackNoTooltip:true,stationaryInspection:true,conditionalStatus:true,committedTurns:1});await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
