// Settings persistence and real touch input, separate from the full run regression.
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { writeFileSync } from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const browser=await chromium.launch({headless:true});const results=[];
for(const [device,viewport]of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]]){
  const context=await browser.newContext({viewport,hasTouch:device==='mobile',deviceScaleFactor:1}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  const state=()=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
  const advance=(ms=1000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
  const click=async id=>{const st=await state(),b=st.buttons.find(b=>b.id===id);assert(b?.enabled,`missing ${id}`);const x=st.viewport.x+(b.x+b.w/2)*st.viewport.width/320,y=st.viewport.y+(b.y+b.h/2)*st.viewport.height/480;if(device==='mobile')await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);await advance();};
  await p.goto(process.env.U03_URL??'http://127.0.0.1:5313');await p.waitForFunction(()=>typeof window.advanceTime==='function');await advance(1500);
  await click('profile');await p.screenshot({path:`docs/tasks/U03.shots/stats-zh-${device}.jpg`,type:'jpeg',quality:64});await click('back');
  await click('settings');for(const id of ['clock','dimming','smooth','mute','volume-down','language'])await click(id);
  const expected=(await state()).settings;assert.deepEqual(expected,{clock:true,dimming:false,smooth:false,muted:true,volume:.9});
  await p.reload();await p.waitForFunction(()=>typeof window.advanceTime==='function');await advance(1500);assert.deepEqual((await state()).settings,expected);assert.equal((await state()).language,'en');
  await click('new');await p.locator('#player-name').fill('abcdefghijklmnopEXTRA');assert.equal(await p.locator('#player-name').inputValue(),'abcdefghijklmnop');await click('start');await advance(1500);await click('begin');await advance(2000);assert.equal((await state()).screen,'game');assert.equal((await state()).helpBits,0);
  await click('menu');await click('clock');assert.equal((await state()).settings.clock,false);await click('main');await click('settings');assert.equal((await state()).settings.clock,false);await click('reset-help');assert.equal((await state()).helpBits,0x7fffff);await click('back');await click('continue');assert.equal((await state()).screen,'help');
  assert.deepEqual(errors,[]);results.push({device,touch:device==='mobile',settingsPersisted:true,inGameSettingsShared:true,nameLength16:true,helpReset:true,errors});await context.close();
}
await browser.close();writeFileSync('docs/tasks/U03.smoke.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
