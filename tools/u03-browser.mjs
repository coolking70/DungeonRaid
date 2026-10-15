// U03 browser regression + JPEG review artifacts. No npm installation required.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const url=process.env.U03_URL??'http://127.0.0.1:5313',out='docs/tasks/U03.shots';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[],results=[];
async function open(size){const context=await browser.newContext({viewport:size,deviceScaleFactor:1});await context.addInitScript(()=>{const v=localStorage.getItem('u03.next-fixture');if(v){localStorage.setItem('dungeonraid.session.v2',v);localStorage.removeItem('u03.next-fixture');localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));}});const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});await page.goto(url);await page.waitForFunction(()=>typeof window.advanceTime==='function');await advance(page,1300);return{context,page};}
async function state(p){return p.evaluate(()=>JSON.parse(window.render_game_to_text()));}
async function advance(p,ms=900){await p.evaluate(ms=>window.advanceTime(ms),ms);}
async function point(p,x,y){const st=await state(p);return{x:st.viewport.x+x*st.viewport.width/320,y:st.viewport.y+y*st.viewport.height/480};}
async function click(p,id,ms=900){const st=await state(p),b=st.buttons.find(b=>b.id===id);assert(b,`${st.screen}: missing ${id}`);assert(b.enabled,`${id} disabled`);const q=await point(p,b.x+b.w/2,b.y+b.h/2);await p.mouse.click(q.x,q.y);await advance(p,ms);}
async function shot(p,name){await advance(p,0);await p.screenshot({path:`${out}/${name}.jpg`,type:'jpeg',quality:64});const st=await state(p);writeFileSync(`${out}/${name}.json`,JSON.stringify({screen:st.screen,language:st.language,classTab:st.classTab,scorePage:st.scorePage,buttons:st.buttons,error:st.error,storageError:st.storageError},null,2));}
async function dismiss(p){for(let n=0;n<30;n++){const st=await state(p);if(st.screen==='help'){await click(p,'dismiss-help');continue;}if(st.screen==='unlock'){await click(p,'back');continue;}break;}}
for(const [device,size]of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]]){
  const {context,page:p}=await open(size);
  assert.equal((await state(p)).language,'zh');assert.equal((await state(p)).buttons.find(b=>b.id==='continue').enabled,false);
  await shot(p,`main-zh-${device}`);await click(p,'tutorial');await shot(p,`tutorial-zh-${device}`);await click(p,'next');await click(p,'practice');
  await p.locator('#player-name').fill('地下城探险者U03');await click(p,'mode');await click(p,'mode-0');await shot(p,`mode-zh-${device}`);await click(p,'back');await click(p,'difficulty-2');await shot(p,`difficulty-zh-${device}`);
  await click(p,'class');await shot(p,`class-zh-${device}`);await click(p,'ClassType.1');await shot(p,`class-locked-zh-${device}`);await click(p,'ClassType.0');
  for(const [tab,label]of [[1,'race'],[2,'perks'],[3,'skills']]){await click(p,`tab-${tab}`);await shot(p,`${label}-zh-${device}`);if(tab===2){await click(p,'flaws');await shot(p,`flaws-zh-${device}`);}}
  await click(p,'back');await click(p,'start',1600);assert.equal((await state(p)).screen,'intro');await shot(p,`intro-zh-${device}`);await click(p,'begin',2000);await shot(p,`help-auto-zh-${device}`);await dismiss(p);await advance(p,2000);await dismiss(p);
  assert.equal((await state(p)).screen,'game');assert.equal(await p.evaluate(()=>window.__dr.audioCounts.byId[18]),1);const run=await p.evaluate(()=>window.__dr.state);assert.equal(run.mode,0);assert.equal(run.difficulty,2);assert.equal(run.character.classId,0);
  await shot(p,`game-zh-${device}`);
  // Refresh/continue preserves the original state and seeds, not a reconstructed game.
  await p.reload();await p.waitForFunction(()=>typeof window.advanceTime==='function');await advance(p,1300);await click(p,'continue',1500);await dismiss(p);assert.deepEqual(await p.evaluate(()=>window.__dr.state.rng),run.rng);
  assert.equal(await p.evaluate(()=>window.__dr.state.mode),0);
  let steps=0;
  while(steps++<400){
    await advance(p,12000);await dismiss(p);const st=await state(p);
    if(st.screen==='game-over')break;
    assert.equal(st.error,null);assert.equal(st.storageError,null);
    if(st.screen==='reward'){
      const m=st.menu,need=m.kind==='level'?2:1;
      for(let n=0;n<need;n++)if(!m.selected.includes(n))await click(p,`candidate-${n}`,50);
      await click(p,'confirm',2000);continue;
    }
    assert.equal(st.screen,'game');const chain=await p.evaluate(()=>window.__dr.legalChain);assert(chain,'No legal chain in browser run');
    for(let n=0;n<chain.length;n++){const pos=await point(p,1+(chain[n]%6+.5)*53,84+(Math.floor(chain[n]/6)+.5)*53);await p.mouse.move(pos.x,pos.y);if(n===0)await p.mouse.down();}
    await p.mouse.up();await advance(p,2000);
  }
  assert(steps<400,'Run did not finish');await advance(p,18000);await shot(p,`game-over-zh-${device}`);const terminal=(await state(p)).outcome;assert.equal((await state(p)).games,1);
  await click(p,'scores');assert.equal((await state(p)).scorePage,4);await shot(p,`scores-new-zh-${device}`);await click(p,'back');assert.equal((await state(p)).screen,'main');
  await click(p,'achievements');await shot(p,`achievements-zh-${device}`);for(let n=0;n<6;n++)await click(p,'next');await shot(p,`achievement45-zh-${device}`);await click(p,'back');
  await click(p,'settings');await shot(p,`settings-zh-${device}`);await click(p,'language');await shot(p,`settings-en-${device}`);await click(p,'back');await shot(p,`main-en-${device}`);
  await click(p,'scores');await shot(p,`scores-en-${device}`);await click(p,'back');await click(p,'settings');await click(p,'clear-profile');await shot(p,`clear-confirm1-en-${device}`);await click(p,'yes');await shot(p,`clear-confirm2-en-${device}`);await click(p,'no');await click(p,'back');assert.equal((await state(p)).games,1);
  // Confirm clear and refresh: old state must not be resurrected by pagehide.
  await click(p,'settings');await click(p,'clear-profile');await click(p,'yes');await click(p,'yes');assert.equal((await state(p)).games,0);await p.reload();await p.waitForFunction(()=>typeof window.advanceTime==='function');await advance(p,1300);assert.equal((await state(p)).buttons.find(b=>b.id==='continue').enabled,false);
  results.push({device,naturalRun:{steps,outcome:terminal},clearAndReload:true,errors:errors.length});
  // Seed a separate, labelled visual fixture through the real persistence boundary.
  const fixture=await p.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U03.fixtures.ts`);return m.frontFixture();},process.cwd());
  await p.evaluate(value=>{localStorage.setItem('u03.next-fixture',value);localStorage.setItem('dungeonraid.language','en');},fixture);
  await p.reload();await p.waitForFunction(()=>typeof window.advanceTime==='function');await advance(p,1300);
  await click(p,'scores');await shot(p,`pretzel-fixture-en-${device}`);assert.equal((await state(p)).scorePage,5);
  // Real pointer drag: per-frame velocity and settling, including boundary rejection.
  let a=await point(p,60,200),b=await point(p,255,200);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y);await advance(p,17);await p.mouse.up();await advance(p,600);assert.equal((await state(p)).scorePage,4);
  await shot(p,`scores-full-fixture-en-${device}`);await click(p,'back');
  await click(p,'new');await click(p,'class');await click(p,'ClassType.1');await shot(p,`class-unlocked-fixture-en-${device}`);
  await click(p,'tab-1');await click(p,'RaceType.0');await shot(p,`race-fixture-en-${device}`);
  await click(p,'tab-2');await click(p,'PerkType.0');await click(p,'flaws');await click(p,'FlawType.0');await shot(p,`traits-fixture-en-${device}`);
  await click(p,'tab-3');await click(p,'replace-skill');await click(p,'pick-0');await shot(p,`skill-picker-fixture-en-${device}`);await click(p,'apply');await shot(p,`skills-fixture-en-${device}`);await click(p,'back');
  await click(p,'start',1600);await click(p,'begin',2000);await dismiss(p);const configured=await p.evaluate(()=>window.__dr.state.character);assert.equal(configured.classId,1);assert.equal(configured.race,0);assert.equal(configured.perks[1],0);assert.equal(configured.flaws[1],0);assert.equal(configured.replacementSkills[1],0);
  await click(p,'menu');await click(p,'main');await click(p,'new');assert.equal((await state(p)).screen,'confirm');await shot(p,`new-confirm-fixture-en-${device}`);await click(p,'no');assert.equal((await state(p)).screen,'main');
  results.at(-1).customCharacter=true;results.at(-1).pagerSwipe=true;
  const trophy=await p.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U03.fixtures.ts`);return m.trophyFixture();},process.cwd());
  // Install the pending fixture on the next document, after pagehide saves the live session.
  await p.evaluate(value=>{localStorage.setItem('u03.next-fixture',value);},trophy);

  await p.reload();await p.waitForFunction(()=>typeof window.advanceTime==='function');await advance(p,1300);await click(p,'continue',2000);
  const trophyPos=await point(p,27.5,105.5);await p.mouse.click(trophyPos.x,trophyPos.y);await advance(p,12000);assert.equal((await state(p)).screen,'unlock');await shot(p,`unlock-fixture-en-${device}`);await click(p,'back');assert.equal((await state(p)).screen,'game');results.at(-1).unlock=true;
  await context.close();
}
assert.deepEqual(errors,[]);writeFileSync('docs/tasks/U03.browser.json',JSON.stringify({results,errors},null,2));await browser.close();console.log(JSON.stringify({results,errors}));
