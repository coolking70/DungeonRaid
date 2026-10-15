import { chromium } from '/Users/coolking70/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='docs/tasks/U04.shots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720}});let page=await context.newPage();
const errors=[],checks=[],shots=new Set();const counts={chains:0,skills:0,menus:0};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
await page.addInitScript(()=>{Date.now=()=>12345;});
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(ms=1000)=>page.evaluate(ms=>window.advanceTime(ms),ms);
async function point(x,y){const s=await state();return{x:s.viewport.x+x/320*s.viewport.width,y:s.viewport.y+y/480*s.viewport.height};}
async function click(id,ms=1000){const s=await state(),b=s.buttons.find(b=>b.id===id);assert(b?.enabled,`button ${id} / ${s.screen}`);const p=await point(b.x+b.w/2,b.y+b.h/2);await page.mouse.click(p.x,p.y);await advance(ms);}
async function pair(name){
  if(shots.has(name))return;shots.add(name);
  const before=await page.evaluate(()=>JSON.stringify(window.__dr.state));
  for(const [label,width,height] of [['desktop',1280,720],['mobile',375,812]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await advance(0);
    await page.screenshot({path:`${out}/${name}-${label}.png`});await writeFile(`${out}/${name}-${label}.json`,JSON.stringify(await state(),null,2));
  }
  await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await advance(0);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__dr.state)),before);
}
async function chain(nodes,release=true){const s=await page.evaluate(()=>window.__dr.state);const ps=[];for(const slot of nodes)ps.push(await point(27.5+slot%6*53,105.5+Math.floor(slot/6)*53+(s.challenge?5:0)));await page.mouse.move(ps[0].x,ps[0].y);await page.mouse.down();for(const p of ps.slice(1))await page.mouse.move(p.x,p.y,{steps:2});if(release)await page.mouse.up();}
async function longest(){return page.evaluate(async()=>{
 const {adjacent,canMatchType}=await import('/@fs/Users/coolking70/Documents/同步空间/DungeonRaid/src/core/chain.ts');const s=window.__dr.state;let best=[];
 for(let first=0;first<36;first++){if(!canMatchType(s,first,[]))continue;const nodes=[first];for(;;){const slot=s.board.findIndex((t,i)=>!nodes.includes(i)&&adjacent(t,s.board[nodes.at(-1)])&&canMatchType(s,i,nodes));if(slot<0)break;nodes.push(slot);}if(nodes.length>best.length)best=nodes;}
 return best.length>=3?best:window.__dr.legalChain;
});}
try{
 await page.goto('http://127.0.0.1:5316');await page.waitForFunction(()=>window.render_game_to_text);await advance();await click('new');await page.waitForTimeout(500);await pair('start-zh');
 await click('menu');await pair('game-menu-zh');assert.equal((await state()).buttons.length,7);const before=await page.evaluate(()=>JSON.stringify(window.__dr.state));await advance(5000);assert.equal(await page.evaluate(()=>JSON.stringify(window.__dr.state)),before);checks.push('pause freezes rule/display');
 await click('help');await pair('help-zh');await click('next');await click('close');await click('resume');await click('stats');await pair('stats-zh');await click('equipment-0');await advance(150);await pair('equipment-tooltip-zh');await click('close');
 const first=await longest();await chain(first,false);await pair('preview-zh');await page.dispatchEvent('#game','pointercancel',{pointerId:1,pointerType:'mouse'});await page.mouse.up();assert.equal((await state()).turn,0);checks.push('cancel does not submit');
 await chain(first);counts.chains++;
 for(let n=0;n<1500;n++){
   if(!shots.has('token-zh'))for(let f=0;f<180;f++){await advance(16.67);if((await state()).tokens){await pair('token-zh');break;}if(!(await state()).busy)break;}
   await advance(30000);const s=await state();assert.equal(s.error,null);assert.equal(s.audioError,null);
   if(s.screen==='game-over'){await pair('game-over-zh');break;}
   if(s.screen==='reward'){
     await pair(`${s.menu.kind}-zh`);
     const cs=s.menu.candidates.map((c,i)=>({c,i})).sort((a,b)=>Number(b.c.kind==='skill')-Number(a.c.kind==='skill'));
     for(const {i} of cs.slice(0,s.menu.kind==='level'?2:1))await click(`candidate-${i}`,150);
     await click('confirm');counts.menus++;continue;
   }
   assert.equal(s.screen,'game');const run=await page.evaluate(()=>window.__dr.state);
   if(run.board.some(t=>t.type===1&&t.enemyType>0))await pair('special-zh');
   if(run.health/(run.base.maxHealth+run.equipmentStats.maxHealth)<=.35){for(let beat=0;beat<150;beat++){await advance(16.67);if((await state()).heartbeat>.3)break;}await pair('low-health-zh');}
   const sk=s.buttons.find(b=>b.id.startsWith('skill-')&&b.enabled);if(sk){await click(sk.id);counts.skills++;continue;}
   const nodes=await longest();assert(nodes,'stuck');await chain(nodes);counts.chains++;
 }
 assert.equal((await state()).screen,'game-over');checks.push('natural complete run via real pointer input');
 const audio=await page.evaluate(()=>window.__dr.audio);assert(audio.some(v=>v.played),'audio player must actually start voices');
 await writeFile(`${out}/audio-log.json`,JSON.stringify(audio,null,2));const final=await state(),audioCounts=await page.evaluate(()=>window.__dr.audioCounts);
 await click('main');await click('settings');await click('language');await click('return');await click('new');await pair('start-en');await click('menu');await pair('game-menu-en');await click('resume');await click('stats');await pair('stats-en');await click('close');
 for(const kind of ['sprint','pretzel']){
   const fixture=await page.evaluate(async kind=>{const {endingFixture}=await import('/@fs/Users/coolking70/Documents/同步空间/DungeonRaid/docs/tasks/U04.fixtures.ts');return endingFixture(kind);},kind);
   const fc=await browser.newContext({viewport:{width:1280,height:720},storageState:{cookies:[],origins:[{origin:'http://127.0.0.1:5316',localStorage:[{name:'dungeonraid.session.v2',value:fixture},{name:'dungeonraid.language',value:'en'}]}]}});page=await fc.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:5316');await page.waitForFunction(()=>window.render_game_to_text);await advance();await click('continue');await advance(30000);assert.equal((await state()).screen,'game-over');await pair(`${kind}-fixture-en`);
 }
 await writeFile(`${out}/acceptance.json`,JSON.stringify({checks,counts,shots:[...shots],final,audioCounts,audioCalls:audio.length,played:audio.filter(v=>v.played).length,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({counts,shots:[...shots],turns:final.turn,audioCalls:audio.length,errors}));
}catch(e){await page.screenshot({path:`${out}/failure.png`});await writeFile(`${out}/failure.json`,JSON.stringify({state:await state().catch(()=>null),errors},null,2));throw e;}finally{await browser.close();}
