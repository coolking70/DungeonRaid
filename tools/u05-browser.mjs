// Reproducible real pointer input + 60 Hz presentation clock measurements.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? `${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const tag=process.argv[2]??'after', url=process.env.U05_URL??'http://127.0.0.1:5315';
const browser=await chromium.launch({headless:true}), results=[], realtime=[], errors=[];
const out='docs/tasks/U05.shots';mkdirSync(out,{recursive:true});
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function point(p,slot){const st=await state(p);return{x:st.viewport.x+(27.5+slot%6*53)*st.viewport.width/320,y:st.viewport.y+(105.5+Math.floor(slot/6)*53)*st.viewport.height/480};}
async function click(p,id){const st=await state(p),b=st.buttons.find(b=>b.id===id);assert(b,`${st.screen}: ${id}`);await p.mouse.click(st.viewport.x+(b.x+b.w/2)*st.viewport.width/320,st.viewport.y+(b.y+b.h/2)*st.viewport.height/480);await advance(p,1000);}
async function load(p,kind,speed='original'){
 await p.evaluate(async({kind,speed,root})=>{
 const {fixture,tile}=await import(`${root}/test/turn-helpers.ts`);const {serializeRun,serializeProfile}=await import(`${root}/src/core/save.ts`);const {createProfileState}=await import(`${root}/src/core/state.ts`);const {enumValue}=await import(`${root}/src/core/data.ts`);
 const s=fixture();s.options.scrollFilter='supplied-native-fixture';
 if(kind==='full')s.resources.gold.remainder=99;
 if(['kill','hurt','poison','countdown'].includes(kind)){
 tile(s,0,4);tile(s,1,4);tile(s,2,1,{attack:1,health:kind==='kill'?1:30,maxHealth:30,enemyType:kind==='countdown'?enumValue('EnemyType','ENEMY_KAMIKAZE'):0,countdown:kind==='countdown'?3:0,poison:kind==='poison'?[2,2,2]:[0,0,0]});
 }
 localStorage.setItem('u05.next-fixture',JSON.stringify({version:2,profile:serializeProfile(createProfileState()),run:serializeRun(s).json}));localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));localStorage.setItem('dungeonraid.animationSpeed',speed);
 },{kind,speed,root:'/@fs'+resolve('.')});
 await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p,1500);await click(p,'continue');assert.equal((await state(p)).screen,'game');
}
async function drag(p,n,release=true){const path=Array.from({length:n},(_,i)=>Math.floor(i/6)*6+(Math.floor(i/6)%2?5-i%6:i%6));for(let i=0;i<path.length;i++){const q=await point(p,path[i]);await p.mouse.move(q.x,q.y);if(!i)await p.mouse.down();}if(release)await p.mouse.up();}
async function shot(p,name){await advance(p,0);await p.screenshot({path:`${out}/${name}.jpg`,type:'jpeg',quality:65});}
try{
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]]){
 const c=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:device==='mobile'}),p=await c.newPage();await c.addInitScript(()=>{const v=localStorage.getItem('u05.next-fixture');if(v){localStorage.setItem('dungeonraid.session.v2',v);localStorage.removeItem('u05.next-fixture');}});p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await advance(p,1500);
 if(device==='desktop')for(const speed of tag==='before'?['original']:['original','fast'])for(const kind of [3,8,15,25,'kill','full']){
 await load(p,kind,speed);await drag(p,typeof kind==='number'?kind:3);let frames=0,maxTokens=0;const start=performance.now();while((await state(p)).busy&&frames<1800){await advance(p,1000/60);maxTokens=Math.max(maxTokens,(await state(p)).tokens);frames++;}const st=await state(p);assert(!st.busy);assert.equal(st.error,null);results.push({kind,speed,ms:Math.round(frames*1000/60),frames,maxTokens,phase:st.phase,harnessWallMs:Math.round(performance.now()-start)});
 if(tag!=='before'){
 const expected=await p.evaluate(()=>JSON.stringify(window.__dr.state));await load(p,kind,speed);await drag(p,typeof kind==='number'?kind:3);const q=await point(p,35);await p.evaluate(()=>{window.u05ClickStart=0;window.u05ClickMs=0;const c=document.querySelector('canvas');c.addEventListener('pointerdown',()=>{window.u05ClickStart=performance.now();},{capture:true,once:true});c.addEventListener('pointerdown',()=>{window.u05ClickMs=performance.now()-window.u05ClickStart;},{once:true});});
 await p.mouse.click(q.x,q.y);const ms=await p.evaluate(()=>window.u05ClickMs);await advance(p,1000/60);assert.equal((await state(p)).busy,false);assert.equal(await p.evaluate(()=>JSON.stringify(window.__dr.state)),expected);results.at(-1).skipHandlerMs=ms;results.at(-1).skipFrames=1;
 if(kind==='full'){assert.equal((await state(p)).screen,'reward');await click(p,'candidate-0');assert.deepEqual((await state(p)).menu.selected,[0]);}
 }
 }
 if(tag!=='before'){
 await load(p,25);await drag(p,25);const q=await point(p,35);if(device==='mobile')await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);await advance(p,1000/60);assert.equal((await state(p)).busy,false);assert.equal((await state(p)).tooltip.showing,false);assert.deepEqual(await p.evaluate(()=>window.__dr.state.chain.nodes),[]);
 await click(p,'menu');await click(p,'main');await click(p,'settings');await click(p,'animation-speed');assert.equal((await state(p)).animationSpeed,'fast');await shot(p,`${device}-settings`);await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p,1500);assert.equal((await state(p)).animationSpeed,'fast');
 }
 if(tag!=='before')for(const kind of ['hurt','countdown','poison']){
 await load(p,kind);await shot(p,`${device}-${kind}-before`);await drag(p,3,false);await advance(p,0);if(kind==='hurt')await shot(p,`${device}-damage-preview`);await p.mouse.up();await advance(p,100);if(kind==='hurt'){const v=(await state(p)).board[2];assert.equal(v.hp,23);await shot(p,`${device}-hurt-during`);}await advance(p,10000);await shot(p,`${device}-${kind}-after`);
 const enemy=(await state(p)).board.find(t=>t.type===1&&t.hp>10);assert(enemy);if(kind==='hurt')assert(enemy.hp<30);if(kind==='countdown')assert.equal(enemy.countdown,2);if(kind==='poison')assert(enemy.hp<30);
 if(kind==='poison'){const q=await point(p,2);await p.mouse.move(q.x,q.y);await p.mouse.down();await advance(p,500);assert.equal((await state(p)).tooltip.showing,true);await p.mouse.up();if(device==='mobile')await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);await advance(p,200);assert.equal((await state(p)).tooltip.showing,true);assert((await state(p)).tooltip.body.length>=5);await shot(p,`${device}-enemy-tooltip`);}
 }
 if(tag!=='before'&&device==='desktop')for(const skip of [false,true]){
 await load(p,25);await p.reload();await p.waitForFunction(()=>!!window.render_game_to_text&&!JSON.parse(window.render_game_to_text()).transitioning);const st=await state(p),b=st.buttons.find(b=>b.id==='continue');await p.mouse.click(st.viewport.x+(b.x+b.w/2)*st.viewport.width/320,st.viewport.y+(b.y+b.h/2)*st.viewport.height/480);await p.waitForFunction(()=>JSON.parse(window.render_game_to_text()).screen==='game'&&!JSON.parse(window.render_game_to_text()).transitioning);
 await p.evaluate(()=>{document.querySelector('canvas').addEventListener('pointerup',()=>{window.u05Submit=performance.now();},{capture:true,once:true});});await drag(p,25);
 let clickAt;if(skip){const q=await point(p,35);await p.evaluate(()=>{document.querySelector('canvas').addEventListener('pointerdown',()=>{window.u05Skip=performance.now();},{capture:true,once:true});});await p.mouse.click(q.x,q.y);clickAt=true;}
 await p.waitForFunction(()=>!window.__dr.busy);realtime.push(await p.evaluate(skip=>({chain:25,skip,ms:performance.now()-(skip?window.u05Skip:window.u05Submit),phase:window.__dr.state.phase}),!!clickAt));
 }
 await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`docs/tasks/U05.${tag}.json`,JSON.stringify({clock:'60Hz window.advanceTime; actual browser rendering and pointer input',results,realtime,errors},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
