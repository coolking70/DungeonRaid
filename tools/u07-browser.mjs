// Real mouse/touch regression for U07; screenshots are QA outputs, never tutorial assets.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const url=process.env.U07_URL??'http://127.0.0.1:5318',out=process.env.U07_OUT??'docs/tasks/U07.shots';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const advance=(p,ms=700)=>p.evaluate(ms=>window.advanceTime(ms),ms);
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const game=p=>p.evaluate(()=>({profile:window.__dr.profile,state:window.__dr.state}));
async function click(p,id,touch=false){const st=await state(p),b=st.buttons.find(b=>b.id===id);assert(b?.enabled,`${st.screen}: ${id} missing/disabled`);const x=st.viewport.x+(b.x+b.w/2)*st.viewport.width/320,y=st.viewport.y+(b.y+b.h/2)*st.viewport.height/480;if(touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);await advance(p);}
async function shot(p,name){const s=await state(p);await p.screenshot({path:`${out}/${name}.jpg`,type:'jpeg',quality:70,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
try {
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const locale of ['zh','en']) {
  const context=await browser.newContext({viewport,hasTouch:device==='mobile'}),p=await context.newPage(),touch=device==='mobile';
  await context.addInitScript(locale=>localStorage.setItem('dungeonraid.language',locale),locale);
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await advance(p,1300);
  const before=await game(p),bits=(await state(p)).helpBits;
  await click(p,'tutorial',touch);
  for(let n=0;n<23;n++){assert.equal((await state(p)).tutorialPage,n);await shot(p,`${device}-${locale}-tutorial-${String(n+1).padStart(2,'0')}`);if(n<22)await click(p,'next',touch);}
  assert.equal((await state(p)).buttons.find(b=>b.id==='next').enabled,false);
  await click(p,'prev',touch);assert.equal((await state(p)).tutorialPage,21);
  assert.deepEqual(await game(p),before);assert.equal((await state(p)).helpBits,bits);
  await click(p,'back',touch);await click(p,'new',touch);await click(p,'class',touch);
  const profileBefore=(await game(p)).profile;
  await click(p,'class-rewards',touch);assert.equal((await state(p)).buttons.filter(b=>b.id.startsWith('reward-level')).length,1);await shot(p,`${device}-${locale}-adventurer`);await click(p,'back',touch);
  for(let c=1;c<10;c++){
    await click(p,`ClassType.${c}`,touch);assert.equal((await state(p)).configuration.classId,c);
    if(c===1)await shot(p,`${device}-${locale}-class-locked`);
    await click(p,'class-rewards',touch);
    for(let n=1;n<=10;n++) {await click(p,`reward-level-${n}`,touch);const reward=(await state(p)).rewardPreview;assert.equal(reward.classId,c);assert.equal(reward.level,n);assert(!/[{}]|ui\./.test(reward.description));if(c===1&&[1,5,10].includes(n))await shot(p,`${device}-${locale}-reward-${n}`);}
    await click(p,'back',touch);assert.equal((await state(p)).configuration.classId,c);
  }
  await click(p,'unlock-help',touch);await shot(p,`${device}-${locale}-unlock-help-1`);let pages=1;while((await state(p)).buttons.find(b=>b.id==='next')?.enabled){await click(p,'next',touch);pages++;await shot(p,`${device}-${locale}-unlock-help-${pages}`);}await click(p,'back',touch);
  await click(p,'ClassType.0',touch);await click(p,'tab-1',touch);
  for(let r=0;r<10;r++){await click(p,`RaceType.${r}`,touch);assert.equal((await state(p)).inspectedRace,r);assert.equal((await state(p)).configuration.race,0);await click(p,'race-details',touch);assert((await state(p)).detailsText.length>0);if([0,1,2].includes(r))await shot(p,`${device}-${locale}-race-${r}`);await click(p,'back',touch);}
  assert.deepEqual((await game(p)).profile,profileBefore);
  await click(p,'back',touch);await click(p,'back',touch);assert.equal((await state(p)).screen,'main');
  // The practice path still starts Easy and enables the original automatic help.
  await click(p,'tutorial',touch);await click(p,'practice',touch);assert.equal((await state(p)).screen,'name');await click(p,'start',touch);await click(p,'begin',touch);await advance(p,3000);assert.equal((await game(p)).state.difficulty,0);assert.equal((await state(p)).screen,'help');await shot(p,`${device}-${locale}-practice`);
  results.push({device,locale,tutorialPages:23,rewardPreviews:90,races:10,helpPages:pages,readOnlyVerified:true,practiceEasy:true});await context.close();
 }
 // Explicit level 4/5/10 fixtures through the real save loader; isolated browser profiles.
 if(!process.env.U07_PRODUCTION)for(const level of [4,5,10]){
  const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);
  const fixture=await p.evaluate(async({root,level})=>{const {createProfileState}=await import(`/@fs${root}/src/core/state.ts`);const {serializeProfile}=await import(`/@fs${root}/src/core/save.ts`);const profile=createProfileState();profile.classes[1].level=level;profile.classes[8].level=5;return JSON.stringify({version:2,profile:serializeProfile(profile),run:null});},{root:process.cwd(),level});
  await context.addInitScript(value=>localStorage.setItem('dungeonraid.session.v2',value),fixture);
  await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p,1300);
  await click(p,'new',true);await click(p,'class',true);await click(p,'ClassType.1',true);await click(p,'class-rewards',true);await click(p,'reward-level-5',true);await shot(p,`fixture-level-${level}-rewards`);await click(p,'back',true);
  await click(p,'tab-1',true);await click(p,'RaceType.2',true);assert.equal((await state(p)).configuration.race,level>=5?2:1);await shot(p,`fixture-level-${level}-race`);
  await click(p,'race-details',true);assert((await state(p)).detailsText.includes('战士'));await click(p,'back',true);await click(p,'back',true);
  assert.equal((await game(p)).profile.classes[1].race,level>=5?2:1);results.push({fixture:true,level,raceChangeAllowed:level>=5});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
} finally {await browser.close();}
