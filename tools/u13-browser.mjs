import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U13_OUT??'/tmp/U13-browser',url=process.env.U13_URL??'http://127.0.0.1:5319';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=2000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function point(p,x,y){const {viewport:v}=await snap(p);return{x:v.x+x*v.width/320,y:v.y+y*v.height/480};}
async function tap(p,b,touch){const pt=await point(p,b.x+b.w/2,b.y+b.h/2);if(touch)await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y);await advance(p);}
async function click(p,id,touch){const s=await snap(p),b=[...s.buttons,...s.tooltip.controls].find(b=>b.id===id);assert(b,`missing ${id}: ${s.screen}`);await tap(p,b,touch);}
async function shot(p,name){const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await source.waitForFunction(()=>!!window.advanceTime);
 const fixtures=await source.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U13.fixtures.ts`);return Object.fromEntries(['normal','fresh','sprint','easy','limit','complete'].map(k=>[k,m.trophyFixture(k)]));},process.cwd());await source.close();
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const language of ['zh','en']){
  const touch=device==='mobile',c=await browser.newContext({viewport,hasTouch:touch});
  for(const kind of Object.keys(fixtures)){
   const p=await c.newPage();await p.addInitScript(({fixture,language})=>{localStorage.setItem('dungeonraid.session.v2',fixture);localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));},{fixture:fixtures[kind],language});
   p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
   await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'profile',touch);
   await shot(p,`${device}-${language}-${kind}-profile`);
   const profileRow=(await snap(p)).trophyProgress;
   await click(p,'trophy-progress',touch);assert.equal((await snap(p)).screen,'details');assert((await snap(p)).detailsText.length>0);await click(p,'back',touch);await click(p,'back',touch);
   await click(p,'continue',touch);await click(p,'stats',touch);
   const s=await snap(p);assert.equal(s.stats.length,18);
   const expected={normal:'2',fresh:'1',sprint:'≥12',easy:language==='zh'?'简单难度不掉落':'Disabled on Easy',limit:language==='zh'?'本局已达上限':'Run limit reached',complete:language==='zh'?'无可成长职业':'No eligible classes'}[kind];
   assert.equal(profileRow.value,expected);assert.equal(s.stats.at(-1).value,expected);await shot(p,`${device}-${language}-${kind}`);
   await click(p,'trophy-progress',touch);assert.equal((await snap(p)).tooltip.showing,true);if(kind==='sprint')assert((await snap(p)).tooltip.body.join('').includes('50/101'));await shot(p,`${device}-${language}-${kind}-details`);
   await tap(p,{x:8,y:48,w:5,h:5},touch);await click(p,'close',touch);assert.equal((await snap(p)).screen,'game');
   if(kind==='normal'){
    const points=await Promise.all([12,13,14].map(n=>point(p,27.5+n%6*53,79+(Math.floor(n/6)+.5)*53)));
    if(touch){const cdp=await c.newCDPSession(p);for(const [n,pt] of points.entries()){await cdp.send('Input.dispatchTouchEvent',{type:n?'touchMove':'touchStart',touchPoints:[{...pt,id:1}]});await p.evaluate(()=>new Promise(requestAnimationFrame));}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else{await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();for(const pt of points.slice(1)){await p.mouse.move(pt.x,pt.y);await p.evaluate(()=>new Promise(requestAnimationFrame));}await p.mouse.up();}
    await p.evaluate(()=>new Promise(requestAnimationFrame));await advance(p,18000);await click(p,'stats',touch);assert.equal((await snap(p)).stats.at(-1).value,'1');await shot(p,`${device}-${language}-after-kill`);await click(p,'close',touch);
   }
   results.push({device,language,kind,value:expected,tooltip:true});await p.close();
  }
  await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
