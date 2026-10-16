// Isolated QA contexts only. Secret flag fixture never modifies authoritative files.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const url=process.env.U06_URL??'http://127.0.0.1:5316',out='docs/tasks/U06.shots';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=1000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function click(p,id,ms=1000,count=1){const before=await p.evaluate(()=>window.u06PointerUps??0);const st=await state(p),b=st.buttons.find(b=>b.id===id);assert(b?.enabled,`${st.screen}: ${id}`);await p.mouse.click(st.viewport.x+(b.x+b.w/2)*st.viewport.width/320,st.viewport.y+(b.y+b.h/2)*st.viewport.height/480,{clickCount:count});await p.waitForFunction(n=>(window.u06PointerUps??0)>n,before);await advance(p,ms);}
async function shot(p,name){await advance(p,0);await p.screenshot({path:`${out}/${name}.jpg`,type:'jpeg',quality:66});}
try{
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:device==='mobile'}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  // Stop the RAF clock at the first published QA snapshot, still inside main fade-in.
  await p.addInitScript(()=>{window.u06PointerUps=0;document.addEventListener('pointerup',()=>window.u06PointerUps++);Object.defineProperty(window,'advanceTime',{configurable:true,set(fn){Object.defineProperty(window,'advanceTime',{value:fn,writable:true,configurable:true});fn(0);}});const v=localStorage.getItem('u06.next-fixture');if(v){localStorage.setItem('dungeonraid.session.v2',v);localStorage.removeItem('u06.next-fixture');}});
  await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);
  assert((await state(p)).transitioning);await click(p,'settings',0,2);assert.equal((await state(p)).screen,'main');await advance(p,1100);assert.equal((await state(p)).screen,'settings');assert.deepEqual((await state(p)).stack,['main','settings']);
  results.push({device,firstFadeDoubleClick:'one settings screen'});
  assert.equal((await state(p)).soundStyle,'original');if(device==='mobile'){const st=await state(p),b=st.buttons.find(b=>b.id==='sound-style');await p.touchscreen.tap(st.viewport.x+(b.x+b.w/2)*st.viewport.width/320,st.viewport.y+(b.y+b.h/2)*st.viewport.height/480);await advance(p,1000);}else await click(p,'sound-style');assert.equal((await state(p)).soundStyle,'synth');await shot(p,`${device}-settings-synth`);
  await click(p,'language');await shot(p,`${device}-settings-en`);await click(p,'language');
  await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p,1100);assert.equal((await state(p)).soundStyle,'synth');await click(p,'settings');await click(p,'sound-style');assert.equal((await state(p)).soundStyle,'original');await shot(p,`${device}-settings-original`);await click(p,'back');
  const layout=await p.evaluate(async()=>{const [{achievements,achievementText},{I18n},{wrap}]=await Promise.all([import('/achievements.ts'),import('/i18n.ts'),import('/widgets.ts')]);const runtime=(await import('/generated/runtime.json')).default;const i=new I18n({getItem:()=>null,setItem(){}});i.install('en',runtime.en);i.install('zh',runtime.zh);i.installCatalog(runtime.catalog);const ctx=document.querySelector('canvas').getContext('2d'),rows=[];for(const language of ['zh','en']){i.setLanguage(language);for(const a of achievements){const r=achievementText(a,0,i);rows.push({language,id:a.enumValue,titleLines:wrap(ctx,r.title,266).length,descriptionLines:wrap(ctx,r.description,266).length});}}return rows;});assert(layout.every(r=>r.titleLines<=2&&r.descriptionLines<=3));results.push({device,measuredAchievementTexts:layout.length*2,maxTitleLines:Math.max(...layout.map(r=>r.titleLines)),maxDescriptionLines:Math.max(...layout.map(r=>r.descriptionLines))});
  await click(p,'achievements');assert.equal((await state(p)).achievements[0].description,'解锁游侠职业');await shot(p,`${device}-achievements-zh`);
  // All 77 original rows are public. Exercise a future/fixture secret without rewriting source data.
  await p.evaluate(async()=>{const m=await import('/achievements.ts');m.achievements[0].is_secret=true;});await advance(p,0);assert.equal((await state(p)).achievements[0].description,'???');await shot(p,`${device}-achievements-secret-fixture-zh`);
  await click(p,'back');await click(p,'settings');await click(p,'language');await click(p,'back');await click(p,'achievements');assert.equal((await state(p)).achievements[0].description,'???');await shot(p,`${device}-achievements-secret-fixture-en`);
  await p.evaluate(async()=>{const m=await import('/achievements.ts');m.achievements[0].is_secret=false;});await advance(p,0);await shot(p,`${device}-achievements-en`);
  for(let page=0;page<26;page++){
    const st=await state(p);assert.equal(st.achievementPage,page);assert(st.achievements.every(a=>a.title&&!a.title.startsWith('achievement.')&&a.description));
    if([14,18,21,24,25].includes(page))await shot(p,`${device}-achievements-en-${page+1}`);
    if(page<25)await click(p,'next',300);
  }
  await click(p,'back');await click(p,'settings');await click(p,'language');await click(p,'back');await click(p,'profile');await shot(p,`${device}-statistics-easy-note`);await click(p,'back');
  // Genuine board-clear trigger: start from a saved all-coin board, then use actual pointer input.
  await p.evaluate(async root=>{
    const {fixture}=await import(`${root}/test/turn-helpers.ts`),{serializeRun,serializeProfile}=await import(`${root}/src/core/save.ts`),{createProfileState}=await import(`${root}/src/core/state.ts`);
    const s=fixture();s.options.scrollFilter='supplied-native-fixture';
    localStorage.setItem('u06.next-fixture',JSON.stringify({version:2,profile:serializeProfile(createProfileState()),run:serializeRun(s).json}));
    localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));
  },'/@fs'+resolve('.'));
  await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p,1100);assert.equal((await state(p)).transitioning,false);await click(p,'continue');assert.equal((await state(p)).screen,'game');
  const st=await state(p);for(let n=0;n<36;n++){const y=Math.floor(n/6),x=y%2?5-n%6:n%6;await p.mouse.move(st.viewport.x+(27.5+x*53)*st.viewport.width/320,st.viewport.y+(106.5+y*53)*st.viewport.height/480);if(!n)await p.mouse.down();}await p.mouse.up();await advance(p,0);
  if((await state(p)).achievementNotice!==69)writeFileSync('docs/tasks/U06.browser-debug.json',JSON.stringify({device,shown:await state(p),run:await p.evaluate(()=>window.__dr.state)},null,2));
  assert.equal((await state(p)).achievementNotice,69);assert.equal(await p.evaluate(()=>window.__dr.profile.achievements[69]),100);await advance(p,900);assert.equal((await state(p)).achievementNotice,69);await shot(p,`${device}-achievement-unlock`);
  await advance(p,3100);assert.equal((await state(p)).achievementNotice,null);
  assert.equal((await state(p)).error,null);results.push({device,boardClearUnlock:69,noticeExpired:true,soundStylePersistence:true,achievementPages:26});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync('docs/tasks/U06.browser.json',JSON.stringify({results,errors,secretFixture:'Only in isolated browser memory; XML has no secret achievements.'},null,2));
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
