import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U16_OUT??'/tmp/U16-browser',url=process.env.U16_URL??'http://127.0.0.1:5319';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=p=>p.evaluate(()=>window.advanceTime(2000));
async function ready(p){await p.waitForFunction(()=>!!window.advanceTime);await advance(p);}
async function click(p,id,touch=false){const s=await snap(p),b=s.buttons.find(b=>b.id===id);assert(b,`missing ${id} on ${s.screen}`);const v=s.viewport,x=v.x+(b.x+b.w/2)*v.width/320,y=v.y+(b.y+b.h/2)*v.height/480;if(touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);await advance(p);}
async function shot(p,name){await advance(p);const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
const saved=p=>p.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
async function refreshed(p,old){await p.waitForURL(u=>u.searchParams.has('_refresh')&&u.href!==old);await ready(p);}
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await ready(source);
 const fixture=await source.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U14.fixtures.ts`);const f=JSON.parse(m.tileArtFixture()),profile=JSON.parse(f.profile),run=JSON.parse(f.run);profile.state.playerName='U16';profile.state.trophyRemaining=17;profile.state.classes[1].level=3;profile.state.classes[1].games=7;profile.state.classes[1].kills=91;profile.state.achievements['1']=50;run.state.trophies={remaining:17,awarded:2};f.profile=JSON.stringify(profile);f.run=JSON.stringify(run);return f;},process.cwd());await source.close();
 writeFileSync(`${out}/fixture.json`,JSON.stringify(fixture));
 for(const mobile of [false,true])for(const language of ['zh','en']){
  const c=await browser.newContext({viewport:mobile?{width:393,height:851}:{width:1024,height:768},hasTouch:mobile}),p=await c.newPage(),name=`${mobile?'mobile':'desktop'}-${language}`;
  p.on('pageerror',e=>errors.push(String(e)));
  await p.addInitScript(({fixture,language})=>{if(!localStorage.getItem('u16.seeded')){localStorage.setItem('dungeonraid.session.v2',JSON.stringify(fixture));localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));localStorage.setItem('u16.seeded','keep me');}},{fixture,language});
  await p.goto(url);await ready(p);assert.equal((await snap(p)).error,null);await click(p,'settings',mobile);await click(p,'clock',mobile);await click(p,'sound-style',mobile);await shot(p,`${name}-settings`);
  const before=await saved(p),settings=(await snap(p)).settings;
  await p.evaluate(async()=>{const c=await caches.open('u16');await c.put('/assets/u16-old',new Response('old'));await c.put('https://other.test/keep',new Response('keep'));});
  // Keep the fetch pending to verify progress and input locking before navigation.
  let release;const gate=new Promise(r=>release=r);
  await p.route('**/*_refresh=*',async route=>{if(route.request().resourceType()==='fetch')await gate;await route.continue();});
  await click(p,'clear-cache',mobile);assert.equal((await snap(p)).cacheRefresh.busy,true);await shot(p,`${name}-progress`);
  await click(p,'back',mobile);assert.equal((await snap(p)).screen,'resource-refresh');
  const old=p.url();release();await refreshed(p,old);await p.unrouteAll();
  assert.deepEqual(await saved(p),before,'all saved values must survive refresh');assert.deepEqual((await snap(p)).settings,settings);
  assert.deepEqual(await p.evaluate(async()=>{const c=await caches.open('u16');return {own:!!await c.match('/assets/u16-old'),other:!!await c.match('https://other.test/keep')};}),{own:false,other:true});
  await click(p,'continue',mobile);await shot(p,`${name}-restored`);assert.equal((await snap(p)).board.filter(t=>t.arrow).length,1);
  // Returning home from an active run must also preserve the save across failure/retry.
  await p.reload();await ready(p);await click(p,'settings',mobile);const baseline=await saved(p);
  await p.route('**/*_refresh=*',route=>route.request().resourceType()==='fetch'?route.abort('internetdisconnected'):route.continue());
  await click(p,'clear-cache',mobile);await p.waitForFunction(()=>JSON.parse(window.render_game_to_text()).cacheRefresh?.busy===false);await shot(p,`${name}-offline`);assert((await snap(p)).cacheRefresh.failure);assert.deepEqual(await saved(p),baseline);
  await p.unrouteAll();const retryOld=p.url();await click(p,'retry-refresh',mobile);await refreshed(p,retryOld);assert.deepEqual(await saved(p),baseline);
  // Quota/storage failure must cancel before any resource refresh is attempted.
  await click(p,'settings',mobile);await p.evaluate(()=>{window.u16SetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='dungeonraid.session.v2')throw new Error('quota');return window.u16SetItem.call(this,k,v);};});
  const saveOld=p.url();await click(p,'clear-cache',mobile);const failure=(await snap(p)).cacheRefresh;assert.equal(failure.busy,false);assert.equal(failure.total,0);assert(failure.failure);assert.equal(p.url(),saveOld);await shot(p,`${name}-save-failure`);
  await p.evaluate(()=>{Storage.prototype.setItem=window.u16SetItem;});await click(p,'back',mobile);await click(p,'back',mobile);
  // Audit all 10 class-name buttons, including actual cream text pixels, using an unlocked profile.
  await p.goto(`${url}/art/native/icon.png`);await p.evaluate(()=>{const k='dungeonraid.session.v2',f=JSON.parse(localStorage.getItem(k));const profile=JSON.parse(f.profile);for(const cls of profile.state.classes)cls.level=10;f.profile=JSON.stringify(profile);localStorage.setItem(k,JSON.stringify(f));});await p.goto(url);await ready(p);await click(p,'new',mobile);if((await snap(p)).screen==='confirm')await click(p,'yes',mobile);
  const labels=[];for(let n=0;n<10;n++){await click(p,'class',mobile);await click(p,`ClassType.${n}`,mobile);await click(p,'back',mobile);const label=(await snap(p)).buttons.find(b=>b.id==='class').label;assert(label);const pixels=await p.evaluate(()=>{const v=JSON.parse(window.render_game_to_text()).viewport,c=document.querySelector('canvas'),k=c.width/innerWidth,d=c.getContext('2d').getImageData((v.x+100*v.width/320)*k,(v.y+312*v.height/480)*k,180*v.width/320*k,20*v.height/480*k).data;let count=0;for(let i=0;i<d.length;i+=4)if(d[i]>180&&d[i+1]>160&&d[i+2]>120)count++;return count;});assert(pixels>15,`empty class ${n} ${language}`);labels.push({n,label,pixels});if(n===0)await shot(p,`${name}-adventurer`);}
  results.push({name,labels,cacheAndSaveChecks:true});await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
