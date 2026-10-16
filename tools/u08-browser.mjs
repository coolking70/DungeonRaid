// U08: real pointer regression for main-menu rows and trophy help pagination.
import {mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const url=process.env.U08_URL??'http://127.0.0.1:5318',out=process.env.U08_OUT??'/tmp/U08-qa';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=p=>p.evaluate(()=>window.advanceTime(1200));
async function point(p,x,y,touch){const {viewport:v}=await state(p);x=v.x+x*v.width/320;y=v.y+y*v.height/480;if(touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);await advance(p);}
async function click(p,id,touch,edge=0){const s=await state(p),b=s.buttons.find(b=>b.id===id);assert(b?.enabled,`${s.screen}: ${id}`);await point(p,edge===1?b.x+1:edge===2?b.x+b.w-1:b.x+b.w/2,edge===1?b.y+1:edge===2?b.y+b.h-1:b.y+b.h/2,touch);}
async function shot(p,name){const s=await state(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
try {
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const locale of ['zh','en']){
  const touch=device==='mobile',context=await browser.newContext({viewport,hasTouch:touch}),p=await context.newPage();
  await context.addInitScript(locale=>localStorage.setItem('dungeonraid.language',locale),locale);
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await advance(p);
  const initial=await state(p),rows=initial.buttons.filter(b=>b.id!=='sound');
  assert.equal(rows.length,8);
  for(const b of rows){assert.equal(b.w,144);assert.equal(b.h,34);assert.equal(b.x,12);}
  for(let i=0;i<initial.buttons.length;i++)for(const b of initial.buttons.slice(i+1)){const a=initial.buttons[i];assert(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`${a.id} overlaps ${b.id}`);}
  await shot(p,`${device}-${locale}-main`);
  // Centre and both opposite corners must reach the same screen.
  for(const id of ['new','challenge','tutorial'])for(const edge of [0,1,2]){
   await click(p,id,touch,edge);assert.equal((await state(p)).screen,id==='tutorial'?'tutorial':'name');
   if(id!=='tutorial'){await click(p,'mode',touch);await shot(p,`${device}-${locale}-${id}-mode`);await click(p,'back',touch);}
   await click(p,'back',touch);assert.equal((await state(p)).screen,'main');
  }
  for(const b of rows.slice(0,-1)){await point(p,b.x+20,b.y+b.h+4,touch);assert.equal((await state(p)).screen,'main');}
  for(const id of ['continue','scores']){const b=initial.buttons.find(b=>b.id===id);assert.equal(b.enabled,false);await point(p,b.x+b.w/2,b.y+b.h/2,touch);assert.equal((await state(p)).screen,'main');}
  for(const id of ['achievements','profile','settings']){await click(p,id,touch);assert.notEqual((await state(p)).screen,'main');await click(p,'back',touch);}
  const muted=(await state(p)).settings.muted;await click(p,'sound',touch);assert.equal((await state(p)).settings.muted,!muted);await click(p,'sound',touch);
  await click(p,'new',touch);await click(p,'class',touch);await click(p,'unlock-help',touch);
  assert((await state(p)).detailsText.includes(locale==='zh'?'任意种类':'any type'));
  let pages=0;do{await shot(p,`${device}-${locale}-unlock-${++pages}`);if(!(await state(p)).buttons.find(b=>b.id==='next')?.enabled)break;await click(p,'next',touch);}while(pages<10);
  assert(pages<10);await click(p,'back',touch);await click(p,'back',touch);
  await click(p,'start',touch);await click(p,'begin',touch);assert.equal((await p.evaluate(()=>window.__dr.state)).mode,3);
  await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'continue',touch);assert.equal((await state(p)).screen,'game');
  await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'challenge',touch);await click(p,'yes',touch);await click(p,'start',touch);await click(p,'begin',touch);assert.equal((await p.evaluate(()=>window.__dr.state)).mode,0);
  results.push({device,locale,cornerClicks:9,gaps:7,helpPages:pages,classicAndSprint:true,continue:true});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
