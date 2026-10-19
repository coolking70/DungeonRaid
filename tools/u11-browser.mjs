import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U11_OUT??'/tmp/U11-browser',url=process.env.U11_URL??'http://127.0.0.1:5318';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=2000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function tap(p,b,touch){const {viewport:v}=await snap(p);const x=v.x+(b.x+b.w/2)*v.width/320,y=v.y+(b.y+b.h/2)*v.height/480;if(touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);await advance(p);}
async function click(p,id,touch){const s=await snap(p),b=[...s.buttons,...s.tooltip.controls].find(b=>b.id===id);assert(b,`missing ${id}: ${s.screen}`);await tap(p,b,touch);}
async function shot(p,name){const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await source.waitForFunction(()=>!!window.advanceTime);
 const fixtures=await source.evaluate(async root=>(await import(`/@fs${root}/docs/tasks/U11.fixtures.ts`)).attributeFixtures(),process.cwd());await source.close();
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const language of ['zh','en']){
  const touch=device==='mobile',c=await browser.newContext({viewport,hasTouch:touch});
  for(const kind of ['level','upgrade','shop','stats']){
   const p=await c.newPage();await p.addInitScript(({fixture,language})=>{localStorage.setItem('dungeonraid.session.v2',fixture);localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));},{fixture:fixtures[kind],language});
   p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
   await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'continue',touch);
   if(kind==='stats'){
    await click(p,'stats',touch);const rows=(await snap(p)).stats;assert.equal(rows.length,18);await shot(p,`${device}-${language}-stats`);
    await click(p,'equipment-0',touch);assert((await snap(p)).tooltip.pages>1);await shot(p,`${device}-${language}-equipment`);
    await click(p,'tooltip-next',touch);assert.equal((await snap(p)).tooltip.page,1);await shot(p,`${device}-${language}-equipment-page2`);
    // Dismiss outside footer, then inspect the character icon.
    await tap(p,{x:8,y:48,w:5,h:5},touch);await click(p,'character-details',touch);assert.equal((await snap(p)).tooltip.body.length,9);await shot(p,`${device}-${language}-character`);
    await tap(p,{x:8,y:48,w:5,h:5},touch);await click(p,'close',touch);assert.equal((await snap(p)).screen,'game');
    await tap(p,{x:6,y:6,w:53,h:53},touch);assert((await snap(p)).tooltip.body.some(s=>s.includes(language==='zh'?'冷却':'Cooldown')));
    await click(p,'menu',touch);await click(p,'main',touch);await click(p,'new',touch);
    if((await snap(p)).screen==='confirm')await click(p,'yes',touch);
    await click(p,'class',touch);await click(p,'tab-3',touch);await click(p,'skill-slot-0',touch);await click(p,'skill-description',touch);
    assert.equal((await snap(p)).screen,'details');assert((await snap(p)).detailsText.length>0);await shot(p,`${device}-${language}-skill-description`);
   }else{
    assert.equal((await snap(p)).screen,'reward');await shot(p,`${device}-${language}-${kind}`);
    await click(p,'candidate-0',touch);const tooltip=(await snap(p)).tooltip;assert(tooltip.body.length>=2);
    if(kind==='upgrade')assert.equal(tooltip.body[1],'0.25 >> 0.5');
    if(kind==='level'){assert(tooltip.body[1].includes('>>'));await click(p,'candidate-1',touch);}
    await shot(p,`${device}-${language}-${kind}-detail`);
    if(kind==='shop'){
     assert(tooltip.pages>1);const selected=(await snap(p)).menu.selected;
     for(let n=1;n<tooltip.pages;n++){await click(p,'tooltip-next',touch);assert.equal((await snap(p)).tooltip.page,n);assert.deepEqual((await snap(p)).menu.selected,selected);}
     await shot(p,`${device}-${language}-shop-last-page`);
     await tap(p,{x:8,y:48,w:5,h:5},touch);
    }
    const before=await p.evaluate(()=>window.__dr.state);await click(p,'confirm',touch);assert.equal((await snap(p)).screen,'game');
    const after=await p.evaluate(()=>window.__dr.state);
    if(kind==='upgrade')assert.equal(after.equipment[0].stats[6],before.equipment[0].stats[6]+1);
    if(kind==='level'){assert.equal(after.base.damage,before.base.damage+1);assert.equal(after.base.repair,before.base.repair+1);}
    if(kind==='shop')assert.equal(after.equipment[0].stats[6],3);
   }
   await p.close();
  }
  results.push({device,language,menus:['level','upgrade','shop'],statsRows:18,pagination:true,confirmed:true});await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
