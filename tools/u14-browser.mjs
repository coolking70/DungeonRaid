import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U14_OUT??'/tmp/U14-browser',url=process.env.U14_URL??'http://127.0.0.1:5319';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=2500)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function point(p,x,y){const {viewport:v}=await snap(p);return{x:v.x+x*v.width/320,y:v.y+y*v.height/480};}
async function click(p,id,touch){const s=await snap(p),b=s.buttons.find(b=>b.id===id);assert(b,`missing ${id}: ${s.screen}`);const pt=await point(p,b.x+b.w/2,b.y+b.h/2);if(touch)await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y);await advance(p);}
async function shot(p,name){const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
async function pixels(p,slot){return p.evaluate(slot=>{const v=JSON.parse(window.render_game_to_text()).viewport,c=document.querySelector('canvas'),k=c.width/window.innerWidth;return Array.from(c.getContext('2d').getImageData((v.x+(1+slot%6*53)*v.width/320)*k,(v.y+(79+Math.floor(slot/6)*53)*v.height/480)*k,53*v.width/320*k,53*v.height/480*k).data);},slot);}
const diff=(a,b)=>a.reduce((n,v,i)=>n+(Math.abs(v-b[i])>5?1:0),0);
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await source.waitForFunction(()=>!!window.advanceTime);
 const fixtures=await source.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U14.fixtures.ts`);return {variants:m.tileArtFixture(),skills:m.tileArtFixture('skills')};},process.cwd());await source.close();
 for(const art of ['original','redrawn'])for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const language of ['zh','en'])for(const kind of ['variants','skills']){
  const touch=device==='mobile',c=await browser.newContext({viewport,hasTouch:touch}),p=await c.newPage();
  await p.addInitScript(({fixture,language})=>{if(!localStorage.getItem('u14.initialized')){localStorage.setItem('dungeonraid.session.v2',fixture);localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));localStorage.setItem('u14.initialized','1');}},{fixture:fixtures[kind],language});
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await p.goto(`${url}?art=${art}`);await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'continue',touch);
  assert.equal((await snap(p)).art,art==='original'?'原版棋盘贴图':'原创美术');await shot(p,`${art}-${device}-${language}-${kind}`);
  if(kind==='skills'){
   const before=await Promise.all([0,1,2].map(n=>pixels(p,n)));
   await click(p,'skill-0',touch);let s=await snap(p);const magic=s.board.findIndex(t=>t.magicSword);assert(magic>=0&&magic<3);assert(diff(before[magic],await pixels(p,magic))>200,'magic tint must change actual pixels');await shot(p,`${art}-${device}-${language}-magic`);
   await click(p,'skill-1',touch);s=await snap(p);assert.equal(s.board.filter(t=>t.arrow).length,2);const arrow=s.board.findIndex(t=>t.arrow);assert(diff(before[arrow],await pixels(p,arrow))>200,'arrow must replace the full sprite');await shot(p,`${art}-${device}-${language}-arrows`);
   await click(p,'skill-2',touch);assert.equal((await snap(p)).skills[2].active,true);await shot(p,`${art}-${device}-${language}-boost`);
   await click(p,'skill-3',touch);assert.equal((await snap(p)).board.filter(t=>t.mana).length,3);await shot(p,`${art}-${device}-${language}-mana`);
   await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'continue',touch);s=await snap(p);assert.equal(s.board.filter(t=>t.arrow).length,2);assert.equal(s.board.filter(t=>t.magicSword).length,1);assert.equal(s.skills[2].active,true);await shot(p,`${art}-${device}-${language}-restored`);
   const points=await Promise.all([30,31,32].map(n=>point(p,27.5+n%6*53,79+(Math.floor(n/6)+.5)*53)));
   if(touch){const cdp=await c.newCDPSession(p);for(const [n,pt] of points.entries()){await cdp.send('Input.dispatchTouchEvent',{type:n?'touchMove':'touchStart',touchPoints:[{...pt,id:1}]});await p.evaluate(()=>new Promise(requestAnimationFrame));}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();for(const pt of points.slice(1)){await p.mouse.move(pt.x,pt.y);await p.evaluate(()=>new Promise(requestAnimationFrame));}await p.mouse.up();}
   await p.evaluate(()=>new Promise(requestAnimationFrame));await advance(p,18000);assert.equal((await snap(p)).skills[2].active,false);assert.equal((await snap(p)).turn,1);await shot(p,`${art}-${device}-${language}-expired`);
  }
  results.push({art,device,language,kind,passed:true});await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
